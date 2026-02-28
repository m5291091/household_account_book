"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, query, onSnapshot, where, getDocs,
  Timestamp, doc, updateDoc, orderBy, deleteDoc, serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularPayment } from '@/types/RegularPayment';
import { RegularPaymentGroup } from '@/types/RegularPaymentGroup';
import { startOfMonth, endOfMonth, addMonths, addYears } from 'date-fns';

interface Props {
  month: Date;
}

type RecordedInfo = {
  actionId: string;
  expenseId: string;
  prevNextPaymentDate: Timestamp;
  name: string;
  amount: number;
};

const RegularPaymentProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularPayment[]>([]);
  const [groups, setGroups] = useState<RegularPaymentGroup[]>([]);
  const [upcomingPayments, setUpcomingPayments] = useState<RegularPayment[]>([]);
  // Map<regularPaymentId, RecordedInfo> for this month's recorded (not undone) actions
  const [recordedMap, setRecordedMap] = useState<Map<string, RecordedInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection for bulk record
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);

  // Templates + groups subscription
  useEffect(() => {
    if (authLoading || !user) return;

    const templatesQuery = query(collection(db, 'users', user.uid, 'regularPayments'));
    const unsubTemplates = onSnapshot(templatesQuery, (snapshot) => {
      const fetchedTemplates = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RegularPayment));
      setTemplates(fetchedTemplates);
      setLoading(false);
    }, err => {
      console.error(err);
      setError('テンプレートの読み込みに失敗しました。');
      setLoading(false);
    });

    const groupsQuery = query(collection(db, 'users', user.uid, 'regularPaymentGroups'), orderBy('name'));
    const unsubGroups = onSnapshot(groupsQuery, (snapshot) => {
      setGroups(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RegularPaymentGroup)));
    });

    return () => { unsubTemplates(); unsubGroups(); };
  }, [user, authLoading]);

  // Actions subscription (re-runs when month changes)
  useEffect(() => {
    if (authLoading || !user) return;
    const start = startOfMonth(month);
    const end = endOfMonth(month);

    const actionsQuery = query(
      collection(db, 'users', user.uid, 'regularPaymentActions'),
      where('undone', '==', false)
    );
    const unsubActions = onSnapshot(actionsQuery, (snapshot) => {
      const map = new Map<string, RecordedInfo>();
      snapshot.docs.forEach(d => {
        const data = d.data();
        const prevDate: Timestamp = data.prevNextPaymentDate;
        const pd = prevDate.toDate();
        if (pd >= start && pd <= end) {
          map.set(data.regularPaymentId, {
            actionId: d.id,
            expenseId: data.expenseId,
            prevNextPaymentDate: prevDate,
            name: data.name,
            amount: data.amount,
          });
        }
      });
      setRecordedMap(map);
    });

    return () => unsubActions();
  }, [user, authLoading, month]);

  useEffect(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const upcoming = templates.filter(t => {
      if (!t.nextPaymentDate) return false;
      const d = t.nextPaymentDate.toDate();
      return d >= start && d <= end;
    });
    setUpcomingPayments(upcoming);
    setSelectedIds(new Set());
  }, [templates, month]);

  // ── Core: record a single regular payment ──────────────────
  const recordOne = async (template: RegularPayment): Promise<boolean> => {
    if (!user) return false;
    const expenseDate = template.nextPaymentDate.toDate();

    // Duplicate check
    const q = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('regularPaymentId', '==', template.id),
      where('date', '==', Timestamp.fromDate(expenseDate))
    );
    const existing = await getDocs(q);
    if (!existing.empty) return false; // already recorded

    const prevNextPaymentDate = template.nextPaymentDate;

    // Add expense
    const expenseRef = await addDoc(collection(db, 'users', user.uid, 'expenses'), {
      date: Timestamp.fromDate(expenseDate),
      amount: template.amount,
      categoryId: template.categoryId,
      paymentMethodId: template.paymentMethodId,
      store: template.name,
      memo: '定期支出からの自動記録',
      regularPaymentId: template.id,
      isChecked: false,
    });

    // Advance nextPaymentDate
    const newNextPaymentDate = template.frequency === 'months'
      ? addMonths(expenseDate, template.interval)
      : addYears(expenseDate, template.interval);
    await updateDoc(doc(db, 'users', user.uid, 'regularPayments', template.id), {
      nextPaymentDate: Timestamp.fromDate(newNextPaymentDate),
    });

    // Save undo action record (triggers onSnapshot → recordedMap update)
    await addDoc(collection(db, 'users', user.uid, 'regularPaymentActions'), {
      type: 'regular_payment_record',
      regularPaymentId: template.id,
      expenseId: expenseRef.id,
      prevNextPaymentDate,
      name: template.name,
      amount: template.amount,
      undone: false,
      createdAt: serverTimestamp(),
    });

    return true;
  };

  // ── Record single ───────────────────────────────────────────
  const handleRecordOne = async (template: RegularPayment) => {
    setRecording(true);
    try {
      const ok = await recordOne(template);
      if (!ok) alert('この支出は既に記録されています。');
    } catch (err) {
      console.error(err);
      alert('記録に失敗しました。');
    } finally {
      setRecording(false);
    }
  };

  // ── Bulk record ─────────────────────────────────────────────
  const handleBulkRecord = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}件の定期支出をまとめて記録しますか？`)) return;
    setRecording(true);
    try {
      for (const id of Array.from(selectedIds)) {
        const t = upcomingPayments.find(p => p.id === id);
        if (!t) continue;
        await recordOne(t);
      }
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      alert('一部の記録に失敗しました。');
    } finally {
      setRecording(false);
    }
  };

  // ── Undo ────────────────────────────────────────────────────
  const handleUndo = async (regularPaymentId: string) => {
    if (!user) return;
    const info = recordedMap.get(regularPaymentId);
    if (!info) return;
    if (!confirm(`「${info.name}」の記録を取り消しますか？`)) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', info.expenseId));
      await updateDoc(doc(db, 'users', user.uid, 'regularPayments', regularPaymentId), {
        nextPaymentDate: info.prevNextPaymentDate,
      });
      await updateDoc(doc(db, 'users', user.uid, 'regularPaymentActions', info.actionId), {
        undone: true,
      });
      // recordedMap updates via onSnapshot
    } catch (err) {
      console.error(err);
      alert('取り消しに失敗しました。');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === upcomingPayments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(upcomingPayments.map(p => p.id)));
    }
  };

  const handleToggleCheck = async (payment: RegularPayment) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'regularPayments', payment.id), {
        isChecked: !payment.isChecked,
      });
    } catch (err) {
      console.error(err);
      setError('チェック状態の更新に失敗しました。');
    }
  };

  if (loading) return <p>読み込み中...</p>;

  // Show upcoming (unrecorded) + recorded-this-month templates together
  const recordedTemplates = templates.filter(t => recordedMap.has(t.id) && !upcomingPayments.some(u => u.id === t.id));
  const allDisplayPayments = [...upcomingPayments, ...recordedTemplates];

  const totalAmount = allDisplayPayments.reduce((sum, t) => sum + t.amount, 0);
  const selectedAmount = upcomingPayments.filter(p => selectedIds.has(p.id)).reduce((sum, p) => sum + p.amount, 0);

  const groupedPayments = new Map<string, RegularPayment[]>();
  const noGroupPayments: RegularPayment[] = [];
  allDisplayPayments.forEach(t => {
    if (t.groupId && groups.some(g => g.id === t.groupId)) {
      if (!groupedPayments.has(t.groupId)) groupedPayments.set(t.groupId, []);
      groupedPayments.get(t.groupId)!.push(t);
    } else {
      noGroupPayments.push(t);
    }
  });

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">今月の定期支出</h2>
        <p className="text-lg font-bold text-gray-700 dark:text-gray-200">合計: ¥{totalAmount.toLocaleString()}</p>
      </div>

      {error && <p className="text-red-500 mb-3">{error}</p>}

      {allDisplayPayments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">今月支払う予定の定期支出はありません。</p>
      ) : (
        <>
          {/* Bulk action bar (only for unrecorded items) */}
          {upcomingPayments.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={selectedIds.size === upcomingPayments.length && upcomingPayments.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded"
                />
                全て選択 ({selectedIds.size}/{upcomingPayments.length})
              </label>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    選択合計: ¥{selectedAmount.toLocaleString()}
                  </span>
                  <button
                    onClick={handleBulkRecord}
                    disabled={recording}
                    className="ml-auto px-4 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors"
                  >
                    {recording ? '記録中...' : `${selectedIds.size}件をまとめて記録`}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="space-y-6">
            {groups.map(g => {
              const payments = groupedPayments.get(g.id);
              if (!payments || payments.length === 0) return null;
              const groupTotal = payments.reduce((sum, p) => sum + p.amount, 0);
              return (
                <div key={g.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 font-bold text-gray-700 dark:text-gray-200 border-b dark:border-gray-700 flex justify-between items-center">
                    <span>{g.name}</span>
                    <span className="text-sm">小計: ¥{groupTotal.toLocaleString()}</span>
                  </div>
                  <ul className="divide-y dark:divide-gray-700">
                    {payments.map(template => (
                      <PaymentItem
                        key={template.id}
                        template={template}
                        selected={selectedIds.has(template.id)}
                        recordedInfo={recordedMap.get(template.id)}
                        onToggleSelect={() => toggleSelect(template.id)}
                        onToggleCheck={handleToggleCheck}
                        onRecord={handleRecordOne}
                        onUndo={handleUndo}
                        recording={recording}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}

            {noGroupPayments.length > 0 && (
              <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 font-bold text-gray-700 dark:text-gray-200 border-b dark:border-gray-700 flex justify-between items-center">
                  <span>グループなし</span>
                  <span className="text-sm">小計: ¥{noGroupPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</span>
                </div>
                <ul className="divide-y dark:divide-gray-700">
                  {noGroupPayments.map(template => (
                    <PaymentItem
                      key={template.id}
                      template={template}
                      selected={selectedIds.has(template.id)}
                      recordedInfo={recordedMap.get(template.id)}
                      onToggleSelect={() => toggleSelect(template.id)}
                      onToggleCheck={handleToggleCheck}
                      onRecord={handleRecordOne}
                      onUndo={handleUndo}
                      recording={recording}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const PaymentItem = ({
  template, selected, recordedInfo, onToggleSelect, onToggleCheck, onRecord, onUndo, recording
}: {
  template: RegularPayment;
  selected: boolean;
  recordedInfo?: RecordedInfo;
  onToggleSelect: () => void;
  onToggleCheck: (t: RegularPayment) => void;
  onRecord: (t: RegularPayment) => void;
  onUndo: (id: string) => void;
  recording: boolean;
}) => {
  const isRecorded = !!recordedInfo;
  const displayDate = isRecorded
    ? recordedInfo!.prevNextPaymentDate.toDate()
    : template.nextPaymentDate.toDate();

  return (
    <li className={`flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isRecorded ? 'bg-green-50 dark:bg-green-900/10' : 'bg-white dark:bg-black'} ${template.isChecked ? 'text-red-500' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        {!isRecorded ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded shrink-0"
          />
        ) : (
          <span className="w-4 h-4 flex items-center justify-center text-green-500 shrink-0 text-base">✓</span>
        )}
        <div className="min-w-0">
          <p className="font-semibold truncate">{template.name}</p>
          <p className="text-sm">
            {displayDate.toLocaleDateString('ja-JP')} — ¥{template.amount.toLocaleString()}
          </p>
          {isRecorded && (
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">記録済み</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        {!isRecorded && (
          <button
            onClick={() => onToggleCheck(template)}
            className={`text-sm font-medium px-2 py-1 rounded ${template.isChecked ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
          >
            {template.isChecked ? '✔' : 'チェック'}
          </button>
        )}
        {isRecorded ? (
          <button
            onClick={() => onUndo(template.id)}
            disabled={recording}
            className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
          >
            取り消す
          </button>
        ) : (
          <button
            onClick={() => onRecord(template)}
            disabled={recording}
            className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
          >
            記録する
          </button>
        )}
      </div>
    </li>
  );
};

export default RegularPaymentProcessor;
