"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, query, onSnapshot, where, getDocs,
  Timestamp, doc, updateDoc, runTransaction, deleteDoc, serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularIncome } from '@/types/RegularIncome';
import { startOfMonth, endOfMonth, addMonths, addYears, format } from 'date-fns';

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

type UndoEntry = {
  actionId: string;
  regularIncomeId: string;
  incomeId: string;
  prevNextPaymentDate: Timestamp;
  linkedBankAccountId: string | null;
  bankBalanceChange: number;
  name: string;
  amount: number;
};

const RegularIncomeProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularIncome[]>([]);
  const [upcomingIncomes, setUpcomingIncomes] = useState<RegularIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: '', amount: '', totalTaxableAmount: '', category: '', nextPaymentDate: '',
  });
  const [editError, setEditError] = useState<string | null>(null);

  // Selection for bulk record
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);

  // Undo banner entries
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);

  useEffect(() => {
    if (authLoading || !user) return;

    const unsubTemplates = onSnapshot(
      query(collection(db, 'users', user.uid, 'regularIncomes')),
      (snapshot) => {
        setTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RegularIncome)));
        setLoading(false);
      },
      err => { console.error(err); setError('テンプレートの読み込みに失敗しました。'); setLoading(false); }
    );

    const unsubCategories = onSnapshot(
      query(collection(db, 'users', user.uid, 'incomeCategories')),
      (snapshot) => setCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as IncomeCategory)))
    );

    return () => { unsubTemplates(); unsubCategories(); };
  }, [user, authLoading]);

  useEffect(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    setUpcomingIncomes(templates.filter(t => {
      if (!t.nextPaymentDate) return false;
      const d = t.nextPaymentDate.toDate();
      return d >= start && d <= end;
    }));
    setSelectedIds(new Set());
  }, [templates, month]);

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

  // ── Core: record a single regular income ───────────────────
  const recordOne = async (template: RegularIncome): Promise<UndoEntry | null> => {
    if (!user) return null;
    const incomeDate = template.nextPaymentDate.toDate();

    // Duplicate check
    const q = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('regularIncomeId', '==', template.id),
      where('date', '==', Timestamp.fromDate(incomeDate))
    );
    const existing = await getDocs(q);
    if (!existing.empty) return null; // already recorded – skip silently

    const prevNextPaymentDate = template.nextPaymentDate;
    const newNextPaymentDate = template.frequency === 'months'
      ? addMonths(incomeDate, template.interval)
      : addYears(incomeDate, template.interval);

    let incomeId = '';
    const bankBalanceChange = template.linkedBankAccountId ? template.amount : 0;

    await runTransaction(db, async (transaction) => {
      // Add income
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

      // Advance nextPaymentDate
      transaction.update(doc(db, 'users', user.uid, 'regularIncomes', template.id), {
        nextPaymentDate: Timestamp.fromDate(newNextPaymentDate),
      });

      // Update bank balance
      if (template.linkedBankAccountId) {
        const bankRef = doc(db, 'users', user.uid, 'accounts', template.linkedBankAccountId);
        const bankSnap = await transaction.get(bankRef);
        if (bankSnap.exists()) {
          transaction.update(bankRef, { balance: (bankSnap.data().balance || 0) + template.amount });
        }
      }
    });

    // Save undo action record
    const actionRef = await addDoc(collection(db, 'users', user.uid, 'regularIncomeActions'), {
      type: 'regular_income_record',
      regularIncomeId: template.id,
      incomeId,
      prevNextPaymentDate,
      linkedBankAccountId: template.linkedBankAccountId ?? null,
      bankBalanceChange,
      name: template.name,
      amount: template.amount,
      undone: false,
      createdAt: serverTimestamp(),
    });

    return {
      actionId: actionRef.id,
      regularIncomeId: template.id,
      incomeId,
      prevNextPaymentDate,
      linkedBankAccountId: template.linkedBankAccountId ?? null,
      bankBalanceChange,
      name: template.name,
      amount: template.amount,
    };
  };

  // ── Record single ───────────────────────────────────────────
  const handleRecordOne = async (template: RegularIncome) => {
    setRecording(true);
    try {
      const entry = await recordOne(template);
      if (entry) {
        setUndoEntries(prev => [entry, ...prev]);
      } else {
        alert('この収入は既に記録されています。');
      }
    } catch (err) {
      console.error(err); alert('記録に失敗しました。');
    } finally {
      setRecording(false);
    }
  };

  // ── Bulk record ─────────────────────────────────────────────
  const handleBulkRecord = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}件の定期収入をまとめて記録しますか？`)) return;
    setRecording(true);
    const newEntries: UndoEntry[] = [];
    try {
      for (const id of Array.from(selectedIds)) {
        const t = upcomingIncomes.find(p => p.id === id);
        if (!t) continue;
        const entry = await recordOne(t);
        if (entry) newEntries.push(entry);
      }
      setUndoEntries(prev => [...newEntries, ...prev]);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err); alert('一部の記録に失敗しました。');
    } finally {
      setRecording(false);
    }
  };

  // ── Undo ────────────────────────────────────────────────────
  const handleUndo = async (entry: UndoEntry) => {
    if (!user) return;
    if (!confirm(`「${entry.name}」の記録を取り消しますか？`)) return;
    try {
      await runTransaction(db, async (transaction) => {
        // Delete the income
        transaction.delete(doc(db, 'users', user.uid, 'incomes', entry.incomeId));
        // Revert nextPaymentDate
        transaction.update(doc(db, 'users', user.uid, 'regularIncomes', entry.regularIncomeId), {
          nextPaymentDate: entry.prevNextPaymentDate,
        });
        // Revert bank balance
        if (entry.linkedBankAccountId && entry.bankBalanceChange > 0) {
          const bankRef = doc(db, 'users', user.uid, 'accounts', entry.linkedBankAccountId);
          const bankSnap = await transaction.get(bankRef);
          if (bankSnap.exists()) {
            transaction.update(bankRef, { balance: (bankSnap.data().balance || 0) - entry.bankBalanceChange });
          }
        }
        // Mark action as undone
        transaction.update(doc(db, 'users', user.uid, 'regularIncomeActions', entry.actionId), { undone: true });
      });
      setUndoEntries(prev => prev.filter(e => e.actionId !== entry.actionId));
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

  const selectedAmount = upcomingIncomes.filter(p => selectedIds.has(p.id)).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">今月の定期収入</h2>

      {/* Undo banners */}
      {undoEntries.length > 0 && (
        <div className="mb-4 space-y-2">
          {undoEntries.map(entry => (
            <div key={entry.actionId} className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded flex justify-between items-center">
              <span className="text-sm text-gray-700 dark:text-gray-200">
                ✅ 「{entry.name}」を記録しました (¥{entry.amount.toLocaleString()})
                {entry.linkedBankAccountId && <span className="text-xs text-gray-500 ml-1">· 口座残高に反映済み</span>}
              </span>
              <div className="flex gap-2 ml-2 shrink-0">
                <button
                  onClick={() => handleUndo(entry)}
                  className="px-2 py-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                >取り消す</button>
                <button
                  onClick={() => setUndoEntries(prev => prev.filter(e => e.actionId !== entry.actionId))}
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                >閉じる</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-500 mb-3">{error}</p>}

      {upcomingIncomes.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">今月受け取る予定の定期収入はありません。</p>
      ) : (
        <>
          {/* Bulk action bar */}
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

          <ul className="space-y-3">
            {upcomingIncomes.map(template => {
              const paymentDate = template.nextPaymentDate.toDate();
              const isEditing = editingId === template.id;
              return (
                <li key={template.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(template.id)}
                        onChange={() => toggleSelect(template.id)}
                        className="w-4 h-4 rounded shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{template.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {paymentDate.toLocaleDateString('ja-JP')} — ¥{template.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-2 shrink-0">
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
                    </div>
                  </div>

                  {isEditing && (
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
