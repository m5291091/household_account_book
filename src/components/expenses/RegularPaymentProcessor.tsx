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
import { startOfMonth, endOfMonth, addMonths, addYears, isSameDay } from 'date-fns';

interface Props {
  month: Date;
}

type RecordedInfo = {
  expenseId: string;
  actionId?: string;
  prevNextPaymentDate?: Timestamp;
};

/**
 * Compute the expected payment date for a given template in the target month.
 * Works backwards/forwards from nextPaymentDate using the template's frequency/interval.
 * Returns null if no payment falls in that month.
 */
function getPaymentDateForMonth(template: RegularPayment, targetMonth: Date): Date | null {
  if (!template.nextPaymentDate) return null;
  const start = startOfMonth(targetMonth);
  const end = endOfMonth(targetMonth);

  const advance = (d: Date, n: number): Date =>
    template.frequency === 'months'
      ? addMonths(d, n * template.interval)
      : addYears(d, n * template.interval);

  let candidate = template.nextPaymentDate.toDate();
  let iter = 0;
  // Move backwards while candidate is after the target month
  while (candidate > end && iter < 1200) { candidate = advance(candidate, -1); iter++; }
  // Move forwards while candidate is before the target month
  while (candidate < start && iter < 2400) { candidate = advance(candidate, 1); iter++; }
  if (candidate < start || candidate > end) return null;
  // Don't show months beyond the next scheduled payment date
  if (candidate > template.nextPaymentDate.toDate()) return null;
  return candidate;
}

const RegularPaymentProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularPayment[]>([]);
  const [groups, setGroups] = useState<RegularPaymentGroup[]>([]);
  // All templates that have a scheduled payment this month
  const [displayPayments, setDisplayPayments] = useState<RegularPayment[]>([]);
  // Map<regularPaymentId, RecordedInfo> — built from expenses + actions
  const [recordedMap, setRecordedMap] = useState<Map<string, RecordedInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);

  // Templates + groups subscription
  useEffect(() => {
    if (authLoading || !user) return;
    const unsubTemplates = onSnapshot(
      query(collection(db, 'users', user.uid, 'regularPayments')),
      (snapshot) => {
        setTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RegularPayment)));
        setLoading(false);
      },
      err => { console.error(err); setError('読み込みに失敗しました。'); setLoading(false); }
    );
    const unsubGroups = onSnapshot(
      query(collection(db, 'users', user.uid, 'regularPaymentGroups'), orderBy('name')),
      snapshot => setGroups(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RegularPaymentGroup)))
    );
    return () => { unsubTemplates(); unsubGroups(); };
  }, [user, authLoading]);

  // Recorded state: built from expenses for this month + action docs (for undo)
  // Handles BOTH old recordings (no action doc) and new recordings (with action doc)
  useEffect(() => {
    if (authLoading || !user) return;
    const start = Timestamp.fromDate(startOfMonth(month));
    const end = Timestamp.fromDate(endOfMonth(month));

    // These let vars are shared by both snapshot closures
    let expenseMap = new Map<string, RecordedInfo>(); // regularPaymentId -> base info
    let actionMap = new Map<string, { actionId: string; prevNextPaymentDate: Timestamp }>(); // expenseId -> action

    const merge = () => {
      const merged = new Map<string, RecordedInfo>();
      expenseMap.forEach((info, regularPaymentId) => {
        const action = actionMap.get(info.expenseId);
        merged.set(regularPaymentId, {
          expenseId: info.expenseId,
          actionId: action?.actionId,
          prevNextPaymentDate: action?.prevNextPaymentDate,
        });
      });
      setRecordedMap(merged);
    };

    // Watch expenses for this month — source of truth for "recorded" state (old + new)
    const unsubExpenses = onSnapshot(
      query(
        collection(db, 'users', user.uid, 'expenses'),
        where('date', '>=', start),
        where('date', '<=', end)
      ),
      snapshot => {
        const newMap = new Map<string, RecordedInfo>();
        snapshot.docs.forEach(d => {
          const data = d.data();
          if (data.regularPaymentId) {
            newMap.set(data.regularPaymentId, { expenseId: d.id });
          }
        });
        expenseMap = newMap;
        merge();
      }
    );

    // Watch action docs for this month — enrich with undo capability
    const unsubActions = onSnapshot(
      query(collection(db, 'users', user.uid, 'regularPaymentActions'), where('undone', '==', false)),
      snapshot => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);
        const newMap = new Map<string, { actionId: string; prevNextPaymentDate: Timestamp }>();
        snapshot.docs.forEach(d => {
          const data = d.data();
          const pd: Date = (data.prevNextPaymentDate as Timestamp).toDate();
          if (pd >= mStart && pd <= mEnd) {
            newMap.set(data.expenseId, {
              actionId: d.id,
              prevNextPaymentDate: data.prevNextPaymentDate as Timestamp,
            });
          }
        });
        actionMap = newMap;
        merge();
      }
    );

    return () => { unsubExpenses(); unsubActions(); };
  }, [user, authLoading, month]);

  // Compute display payments: all templates with a scheduled date in this month
  useEffect(() => {
    const payments = templates.filter(t => getPaymentDateForMonth(t, month) !== null);
    setDisplayPayments(payments);
    setSelectedIds(new Set());
  }, [templates, month]);

  // Upcoming = display payments not yet recorded
  const upcomingPayments = displayPayments.filter(t => !recordedMap.has(t.id));

  // ── Core: record a single regular payment for this month ─────
  const recordOne = async (template: RegularPayment): Promise<boolean> => {
    if (!user) return false;
    const paymentDate = getPaymentDateForMonth(template, month);
    if (!paymentDate) return false;

    // Duplicate check
    const q = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('regularPaymentId', '==', template.id),
      where('date', '==', Timestamp.fromDate(paymentDate))
    );
    const existing = await getDocs(q);
    if (!existing.empty) return false;

    const prevNextPaymentDate = template.nextPaymentDate;
    // Only advance nextPaymentDate if this payment matches the current "next" date
    const isCurrentNext = isSameDay(paymentDate, template.nextPaymentDate.toDate());

    // Add expense
    const expenseRef = await addDoc(collection(db, 'users', user.uid, 'expenses'), {
      date: Timestamp.fromDate(paymentDate),
      amount: template.amount,
      categoryId: template.categoryId,
      paymentMethodId: template.paymentMethodId,
      store: template.name,
      memo: '定期支出からの自動記録',
      regularPaymentId: template.id,
      isChecked: false,
    });

    if (isCurrentNext) {
      const newNextPaymentDate = template.frequency === 'months'
        ? addMonths(paymentDate, template.interval)
        : addYears(paymentDate, template.interval);
      await updateDoc(doc(db, 'users', user.uid, 'regularPayments', template.id), {
        nextPaymentDate: Timestamp.fromDate(newNextPaymentDate),
      });
    }

    // Save action doc (enables full undo)
    await addDoc(collection(db, 'users', user.uid, 'regularPaymentActions'), {
      type: 'regular_payment_record',
      regularPaymentId: template.id,
      expenseId: expenseRef.id,
      prevNextPaymentDate,
      changedNextPaymentDate: isCurrentNext,
      name: template.name,
      amount: template.amount,
      undone: false,
      createdAt: serverTimestamp(),
    });

    return true;
  };

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

  const handleUndo = async (regularPaymentId: string) => {
    if (!user) return;
    const info = recordedMap.get(regularPaymentId);
    if (!info) return;
    const templateName = templates.find(t => t.id === regularPaymentId)?.name ?? '';
    if (!confirm(`「${templateName}」の記録を取り消しますか？`)) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', info.expenseId));
      if (info.actionId && info.prevNextPaymentDate) {
        // Revert nextPaymentDate if it was changed during recording
        const current = templates.find(t => t.id === regularPaymentId);
        if (current && current.nextPaymentDate.toDate().getTime() !== info.prevNextPaymentDate.toDate().getTime()) {
          await updateDoc(doc(db, 'users', user.uid, 'regularPayments', regularPaymentId), {
            nextPaymentDate: info.prevNextPaymentDate,
          });
        }
        await updateDoc(doc(db, 'users', user.uid, 'regularPaymentActions', info.actionId), { undone: true });
      }
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
    setSelectedIds(
      selectedIds.size === upcomingPayments.length
        ? new Set()
        : new Set(upcomingPayments.map(p => p.id))
    );
  };

  const handleToggleCheck = async (payment: RegularPayment) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'regularPayments', payment.id), {
        isChecked: !payment.isChecked,
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p>読み込み中...</p>;

  const totalAmount = displayPayments.reduce((sum, t) => sum + t.amount, 0);
  const selectedAmount = upcomingPayments.filter(p => selectedIds.has(p.id)).reduce((sum, p) => sum + p.amount, 0);

  const groupedPayments = new Map<string, RegularPayment[]>();
  const noGroupPayments: RegularPayment[] = [];
  displayPayments.forEach(t => {
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

      {displayPayments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">今月支払う予定の定期支出はありません。</p>
      ) : (
        <>
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
                        month={month}
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
                      month={month}
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
  template, month, selected, recordedInfo, onToggleSelect, onToggleCheck, onRecord, onUndo, recording
}: {
  template: RegularPayment;
  month: Date;
  selected: boolean;
  recordedInfo?: RecordedInfo;
  onToggleSelect: () => void;
  onToggleCheck: (t: RegularPayment) => void;
  onRecord: (t: RegularPayment) => void;
  onUndo: (id: string) => void;
  recording: boolean;
}) => {
  const isRecorded = !!recordedInfo;
  const paymentDate = getPaymentDateForMonth(template, month) ?? template.nextPaymentDate.toDate();
  // Is this the "current next" actionable date, or a historical past month?
  const isActionable = isRecorded || isSameDay(paymentDate, template.nextPaymentDate.toDate());
  const nextDateLabel = template.nextPaymentDate
    ? template.nextPaymentDate.toDate().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : '';

  return (
    <li className={`flex items-center justify-between p-3 transition-colors
      ${isRecorded ? 'bg-green-50 dark:bg-green-900/10' : isActionable ? 'bg-white dark:bg-black hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/50 opacity-70'}
      ${template.isChecked ? 'text-red-500' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        {isRecorded ? (
          <span className="w-4 h-4 flex items-center justify-center text-green-500 shrink-0 text-base">✓</span>
        ) : isActionable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded shrink-0"
          />
        ) : (
          <span className="w-4 h-4 flex items-center justify-center text-gray-400 shrink-0 text-base">—</span>
        )}
        <div className="min-w-0">
          <p className="font-semibold truncate">{template.name}</p>
          <p className="text-sm">
            {paymentDate.toLocaleDateString('ja-JP')} — ¥{template.amount.toLocaleString()}
          </p>
          {isRecorded && (
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">記録済み</p>
          )}
          {!isRecorded && !isActionable && (
            <p className="text-xs text-orange-500 font-medium">次回支払日: {nextDateLabel}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-2 shrink-0">
        {isRecorded ? (
          <button
            onClick={() => onUndo(template.id)}
            disabled={recording}
            className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
          >
            取り消す
          </button>
        ) : isActionable ? (
          <>
            <button
              onClick={() => onToggleCheck(template)}
              className={`text-sm font-medium px-2 py-1 rounded ${template.isChecked ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
            >
              {template.isChecked ? '✔' : 'チェック'}
            </button>
            <button
              onClick={() => onRecord(template)}
              disabled={recording}
              className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
            >
              記録する
            </button>
          </>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 px-2">未記録</span>
        )}
      </div>
    </li>
  );
};

export default RegularPaymentProcessor;
