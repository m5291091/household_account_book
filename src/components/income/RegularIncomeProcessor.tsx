"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, query, onSnapshot, where, getDocs,
  Timestamp, doc, updateDoc, runTransaction, deleteDoc, serverTimestamp, orderBy
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularIncome } from '@/types/RegularIncome';
import { startOfMonth, endOfMonth, addMonths, addYears, isSameDay, format } from 'date-fns';

interface Props {
  month: Date;
}

interface IncomeCategory {
  id: string;
  name: string;
}

interface EditFormData {
  name: string;
  amount: string;
  totalTaxableAmount: string;
  category: string;
  nextPaymentDate: string;
}

type RecordedInfo = {
  incomeId: string;
  actionId?: string;
  prevNextPaymentDate?: Timestamp;
  linkedBankAccountId?: string | null;
  bankBalanceChange?: number;
};

/**
 * Compute the expected income date for a template in the target month.
 * Returns null if no income falls in that month, or if the computed date
 * is beyond the next scheduled payment date.
 */
function getPaymentDateForMonth(template: RegularIncome, targetMonth: Date): Date | null {
  if (!template.nextPaymentDate) return null;
  const start = startOfMonth(targetMonth);
  const end = endOfMonth(targetMonth);

  const advance = (d: Date, n: number): Date =>
    template.frequency === 'months'
      ? addMonths(d, n * template.interval)
      : addYears(d, n * template.interval);

  let candidate = template.nextPaymentDate.toDate();
  let iter = 0;
  while (candidate > end && iter < 1200) { candidate = advance(candidate, -1); iter++; }
  while (candidate < start && iter < 2400) { candidate = advance(candidate, 1); iter++; }
  if (candidate < start || candidate > end) return null;
  // Don't show months beyond the next scheduled date
  if (candidate > template.nextPaymentDate.toDate()) return null;
  return candidate;
}

const RegularIncomeProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularIncome[]>([]);
  const [displayIncomes, setDisplayIncomes] = useState<RegularIncome[]>([]);
  const [recordedMap, setRecordedMap] = useState<Map<string, RecordedInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: '', amount: '', totalTaxableAmount: '', category: '', nextPaymentDate: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);

  // Templates + categories subscription
  useEffect(() => {
    if (authLoading || !user) return;
    const unsubTemplates = onSnapshot(
      query(collection(db, 'users', user.uid, 'regularIncomes')),
      (snapshot) => {
        setTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RegularIncome)));
        setLoading(false);
      },
      err => { console.error(err); setError('読み込みに失敗しました。'); setLoading(false); }
    );
    const unsubCategories = onSnapshot(
      query(collection(db, 'users', user.uid, 'incomeCategories')),
      (snapshot) => setCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as IncomeCategory)))
    );
    return () => { unsubTemplates(); unsubCategories(); };
  }, [user, authLoading]);

  // Recorded state: built from incomes for this month + action docs
  useEffect(() => {
    if (authLoading || !user) return;
    const start = Timestamp.fromDate(startOfMonth(month));
    const end = Timestamp.fromDate(endOfMonth(month));

    let incomeExpMap = new Map<string, RecordedInfo>(); // regularIncomeId -> base
    let actionMap = new Map<string, { actionId: string; prevNextPaymentDate: Timestamp; linkedBankAccountId?: string | null; bankBalanceChange?: number }>(); // incomeId -> action

    const merge = () => {
      const merged = new Map<string, RecordedInfo>();
      incomeExpMap.forEach((info, regularIncomeId) => {
        const action = actionMap.get(info.incomeId);
        merged.set(regularIncomeId, {
          incomeId: info.incomeId,
          actionId: action?.actionId,
          prevNextPaymentDate: action?.prevNextPaymentDate,
          linkedBankAccountId: action?.linkedBankAccountId,
          bankBalanceChange: action?.bankBalanceChange,
        });
      });
      setRecordedMap(merged);
    };

    // Watch incomes for this month
    const unsubIncomes = onSnapshot(
      query(
        collection(db, 'users', user.uid, 'incomes'),
        where('date', '>=', start),
        where('date', '<=', end)
      ),
      snapshot => {
        const newMap = new Map<string, RecordedInfo>();
        snapshot.docs.forEach(d => {
          const data = d.data();
          if (data.regularIncomeId) {
            newMap.set(data.regularIncomeId, { incomeId: d.id });
          }
        });
        incomeExpMap = newMap;
        merge();
      }
    );

    // Watch action docs for this month
    const unsubActions = onSnapshot(
      query(collection(db, 'users', user.uid, 'regularIncomeActions'), where('undone', '==', false)),
      snapshot => {
        const mStart = startOfMonth(month);
        const mEnd = endOfMonth(month);
        const newMap = new Map<string, { actionId: string; prevNextPaymentDate: Timestamp; linkedBankAccountId?: string | null; bankBalanceChange?: number }>();
        snapshot.docs.forEach(d => {
          const data = d.data();
          const pd: Date = (data.prevNextPaymentDate as Timestamp).toDate();
          if (pd >= mStart && pd <= mEnd) {
            newMap.set(data.incomeId, {
              actionId: d.id,
              prevNextPaymentDate: data.prevNextPaymentDate as Timestamp,
              linkedBankAccountId: data.linkedBankAccountId ?? null,
              bankBalanceChange: data.bankBalanceChange ?? 0,
            });
          }
        });
        actionMap = newMap;
        merge();
      }
    );

    return () => { unsubIncomes(); unsubActions(); };
  }, [user, authLoading, month]);

  // Compute display incomes for this month
  useEffect(() => {
    const incomes = templates.filter(t => getPaymentDateForMonth(t, month) !== null);
    setDisplayIncomes(incomes);
    setSelectedIds(new Set());
  }, [templates, month]);

  const upcomingIncomes = displayIncomes.filter(t => !recordedMap.has(t.id));

  // ── Edit handlers ───────────────────────────────────────────
  const handleEditClick = (template: RegularIncome) => {
    setEditingId(template.id);
    setEditFormData({
      name: template.name,
      amount: String(template.amount),
      totalTaxableAmount: String(template.totalTaxableAmount || ''),
      category: template.category,
      nextPaymentDate: template.nextPaymentDate ? format(template.nextPaymentDate.toDate(), 'yyyy-MM-dd') : '',
    });
    setEditError(null);
  };

  const handleEditCancel = () => { setEditingId(null); setEditError(null); };

  const handleEditSave = async (template: RegularIncome) => {
    if (!user) return;
    if (!editFormData.name || !editFormData.amount || !editFormData.category || !editFormData.nextPaymentDate) {
      setEditError('すべての必須項目を入力してください。'); return;
    }
    try {
      const nextPaymentDate = new Date(editFormData.nextPaymentDate);
      await updateDoc(doc(db, 'users', user.uid, 'regularIncomes', template.id), {
        name: editFormData.name.trim(),
        amount: Number(editFormData.amount),
        totalTaxableAmount: Number(editFormData.totalTaxableAmount) || 0,
        category: editFormData.category,
        nextPaymentDate: Timestamp.fromDate(nextPaymentDate),
        paymentDay: nextPaymentDate.getDate(),
      });
      setEditingId(null); setEditError(null);
    } catch (err) { console.error(err); setEditError('更新に失敗しました。'); }
  };

  // ── Core: record a single regular income for this month ─────
  const recordOne = async (template: RegularIncome): Promise<boolean> => {
    if (!user) return false;
    const incomeDate = getPaymentDateForMonth(template, month);
    if (!incomeDate) return false;

    // Duplicate check
    const q = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('regularIncomeId', '==', template.id),
      where('date', '==', Timestamp.fromDate(incomeDate))
    );
    const existing = await getDocs(q);
    if (!existing.empty) return false;

    const prevNextPaymentDate = template.nextPaymentDate;
    const isCurrentNext = isSameDay(incomeDate, template.nextPaymentDate.toDate());

    const newNextPaymentDate = isCurrentNext
      ? (template.frequency === 'months'
          ? addMonths(incomeDate, template.interval)
          : addYears(incomeDate, template.interval))
      : null;

    const bankBalanceChange = template.linkedBankAccountId ? template.amount : 0;
    let incomeId = '';

    await runTransaction(db, async (transaction) => {
      const newIncomeRef = doc(collection(db, 'users', user.uid, 'incomes'));
      incomeId = newIncomeRef.id;
      transaction.set(newIncomeRef, {
        date: Timestamp.fromDate(incomeDate),
        amount: template.amount,
        totalTaxableAmount: template.totalTaxableAmount || 0,
        category: template.category,
        source: template.name,
        memo: '定期収入からの自動記録',
        regularIncomeId: template.id,
      });

      if (isCurrentNext && newNextPaymentDate) {
        transaction.update(doc(db, 'users', user.uid, 'regularIncomes', template.id), {
          nextPaymentDate: Timestamp.fromDate(newNextPaymentDate),
        });
      }

      if (template.linkedBankAccountId) {
        const bankRef = doc(db, 'users', user.uid, 'accounts', template.linkedBankAccountId);
        const bankSnap = await transaction.get(bankRef);
        if (bankSnap.exists()) {
          transaction.update(bankRef, { balance: (bankSnap.data().balance || 0) + template.amount });
        }
      }
    });

    await addDoc(collection(db, 'users', user.uid, 'regularIncomeActions'), {
      type: 'regular_income_record',
      regularIncomeId: template.id,
      incomeId,
      prevNextPaymentDate,
      changedNextPaymentDate: isCurrentNext,
      linkedBankAccountId: template.linkedBankAccountId ?? null,
      bankBalanceChange,
      name: template.name,
      amount: template.amount,
      undone: false,
      createdAt: serverTimestamp(),
    });

    return true;
  };

  const handleRecordOne = async (template: RegularIncome) => {
    setRecording(true);
    try {
      const ok = await recordOne(template);
      if (!ok) alert('この収入は既に記録されています。');
    } catch (err) {
      console.error(err); alert('記録に失敗しました。');
    } finally {
      setRecording(false);
    }
  };

  const handleBulkRecord = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}件の定期収入をまとめて記録しますか？`)) return;
    setRecording(true);
    try {
      for (const id of Array.from(selectedIds)) {
        const t = upcomingIncomes.find(p => p.id === id);
        if (!t) continue;
        await recordOne(t);
      }
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err); alert('一部の記録に失敗しました。');
    } finally {
      setRecording(false);
    }
  };

  const handleUndo = async (regularIncomeId: string) => {
    if (!user) return;
    const info = recordedMap.get(regularIncomeId);
    if (!info) return;
    const name = templates.find(t => t.id === regularIncomeId)?.name ?? '';
    if (!confirm(`「${name}」の記録を取り消しますか？`)) return;
    try {
      await runTransaction(db, async (transaction) => {
        transaction.delete(doc(db, 'users', user.uid, 'incomes', info.incomeId));
        if (info.actionId && info.prevNextPaymentDate) {
          const current = templates.find(t => t.id === regularIncomeId);
          if (current && current.nextPaymentDate.toDate().getTime() !== info.prevNextPaymentDate.toDate().getTime()) {
            transaction.update(doc(db, 'users', user.uid, 'regularIncomes', regularIncomeId), {
              nextPaymentDate: info.prevNextPaymentDate,
            });
          }
          if (info.linkedBankAccountId && info.bankBalanceChange) {
            const bankRef = doc(db, 'users', user.uid, 'accounts', info.linkedBankAccountId);
            const bankSnap = await transaction.get(bankRef);
            if (bankSnap.exists()) {
              transaction.update(bankRef, { balance: (bankSnap.data().balance || 0) - info.bankBalanceChange });
            }
          }
          transaction.update(doc(db, 'users', user.uid, 'regularIncomeActions', info.actionId), { undone: true });
        }
      });
    } catch (err) {
      console.error(err); alert('取り消しに失敗しました。');
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
    setSelectedIds(selectedIds.size === upcomingIncomes.length
      ? new Set()
      : new Set(upcomingIncomes.map(p => p.id)));
  };

  if (loading) return <p>読み込み中...</p>;

  const totalAmount = displayIncomes.reduce((sum, t) => sum + t.amount, 0);
  const selectedAmount = upcomingIncomes.filter(p => selectedIds.has(p.id)).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">今月の定期収入</h2>
        <p className="text-lg font-bold text-gray-700 dark:text-gray-200">合計: ¥{totalAmount.toLocaleString()}</p>
      </div>

      {error && <p className="text-red-500 mb-3">{error}</p>}

      {displayIncomes.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">今月受け取る予定の定期収入はありません。</p>
      ) : (
        <>
          {upcomingIncomes.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={selectedIds.size === upcomingIncomes.length && upcomingIncomes.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded"
                />
                全て選択 ({selectedIds.size}/{upcomingIncomes.length})
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

          <ul className="space-y-3">
            {displayIncomes.map(template => {
              const info = recordedMap.get(template.id);
              const isRecorded = !!info;
              const paymentDate = getPaymentDateForMonth(template, month) ?? template.nextPaymentDate.toDate();
              const isActionable = isRecorded || isSameDay(paymentDate, template.nextPaymentDate.toDate());
              const nextDateLabel = template.nextPaymentDate
                ? template.nextPaymentDate.toDate().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
                : '';
              const isEditing = editingId === template.id;

              return (
                <li key={template.id} className={`p-3 rounded-md transition-colors
                  ${isRecorded ? 'bg-green-50 dark:bg-green-900/10' : isActionable ? 'bg-gray-50 dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-900/50 opacity-70'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {isRecorded ? (
                        <span className="w-4 h-4 flex items-center justify-center text-green-500 shrink-0 text-base">✓</span>
                      ) : isActionable ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(template.id)}
                          onChange={() => toggleSelect(template.id)}
                          className="w-4 h-4 rounded shrink-0"
                        />
                      ) : (
                        <span className="w-4 h-4 flex items-center justify-center text-gray-400 shrink-0">—</span>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{template.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {paymentDate.toLocaleDateString('ja-JP')} — ¥{template.amount.toLocaleString()}
                        </p>
                        {isRecorded && (
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium">記録済み
                            {info.linkedBankAccountId && <span className="ml-1">· 口座反映済み</span>}
                          </p>
                        )}
                        {!isRecorded && !isActionable && (
                          <p className="text-xs text-orange-500 font-medium">次回受取日: {nextDateLabel}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-2 shrink-0">
                      {isRecorded ? (
                        <button
                          onClick={() => handleUndo(template.id)}
                          disabled={recording}
                          className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-sm"
                        >
                          取り消す
                        </button>
                      ) : isActionable ? (
                        <>
                          <button
                            onClick={() => isEditing ? handleEditCancel() : handleEditClick(template)}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded text-sm"
                          >
                            {isEditing ? 'キャンセル' : '編集'}
                          </button>
                          <button
                            onClick={() => handleRecordOne(template)}
                            disabled={recording}
                            className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-sm"
                          >
                            記録する
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 px-2">未記録</span>
                      )}
                    </div>
                  </div>

                  {isEditing && isActionable && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">名称</label>
                          <input type="text" value={editFormData.name}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">差引支給額</label>
                          <input type="number" value={editFormData.amount}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, amount: e.target.value }))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">課税合計</label>
                          <input type="number" value={editFormData.totalTaxableAmount}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, totalTaxableAmount: e.target.value }))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">カテゴリー</label>
                          <select value={editFormData.category}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, category: e.target.value }))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black">
                            <option value="">カテゴリーを選択</option>
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">次回受取日</label>
                          <input type="date" value={editFormData.nextPaymentDate}
                            onChange={(e) => setEditFormData(prev => ({ ...prev, nextPaymentDate: e.target.value }))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black" />
                        </div>
                      </div>
                      {editError && <p className="text-red-500 text-xs">{editError}</p>}
                      <button onClick={() => handleEditSave(template)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded text-sm">
                        保存する
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default RegularIncomeProcessor;
