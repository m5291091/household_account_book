"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, onSnapshot, where, getDocs, Timestamp, doc, updateDoc, runTransaction } from 'firebase/firestore';
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

const RegularIncomeProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularIncome[]>([]);
  const [upcomingIncomes, setUpcomingIncomes] = useState<RegularIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: '',
    amount: '',
    totalTaxableAmount: '',
    category: '',
    nextPaymentDate: '',
  });
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    const templatesQuery = query(collection(db, 'users', user.uid, 'regularIncomes'));
    const unsubTemplates = onSnapshot(templatesQuery, (snapshot) => {
      const fetchedTemplates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RegularIncome));
      setTemplates(fetchedTemplates);
      setLoading(false);
    }, err => {
      console.error(err);
      setError('テンプレートの読み込みに失敗しました。');
      setLoading(false);
    });

    const unsubCategories = onSnapshot(query(collection(db, 'users', user.uid, 'incomeCategories')), (snapshot) => {
      setCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as IncomeCategory)));
    });

    return () => {
      unsubTemplates();
      unsubCategories();
    };
  }, [user, authLoading]);

  useEffect(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);

    const upcoming = templates.filter(t => {
      if (!t.nextPaymentDate) return false;
      const nextPaymentDate = t.nextPaymentDate.toDate();
      return nextPaymentDate >= start && nextPaymentDate <= end;
    });

    setUpcomingIncomes(upcoming);
  }, [templates, month]);

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

  const handleEditCancel = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleEditSave = async (template: RegularIncome) => {
    if (!user) return;
    if (!editFormData.name || !editFormData.amount || !editFormData.category || !editFormData.nextPaymentDate) {
      setEditError('すべての必須項目を入力してください。');
      return;
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
      setEditingId(null);
      setEditError(null);
    } catch (err) {
      console.error(err);
      setEditError('更新に失敗しました。');
    }
  };

  const handleRecordIncome = async (template: RegularIncome) => {
    if (!user) return;

    const incomeDate = template.nextPaymentDate.toDate();

    try {
      // Check if an income has already been recorded for this specific payment date
      const q = query(
        collection(db, 'users', user.uid, 'incomes'),
        where('regularIncomeId', '==', template.id),
        where('date', '==', Timestamp.fromDate(incomeDate))
      );
      const existing = await getDocs(q);
      if (!existing.empty) {
        alert('この収入は既に記録されています。');
        return;
      }

      await runTransaction(db, async (transaction) => {
        // Add the income
        const newIncomeRef = doc(collection(db, 'users', user.uid, 'incomes'));
        transaction.set(newIncomeRef, {
          date: Timestamp.fromDate(incomeDate),
          amount: template.amount,
          totalTaxableAmount: template.totalTaxableAmount || 0,
          category: template.category,
          source: template.name,
          memo: '定期収入からの自動記録',
          regularIncomeId: template.id,
        });

        // Calculate the next payment date
        let newNextPaymentDate;
        if (template.frequency === 'months') {
          newNextPaymentDate = addMonths(incomeDate, template.interval);
        } else {
          newNextPaymentDate = addYears(incomeDate, template.interval);
        }

        // Update the regular income with the new next payment date
        const incomeRef = doc(db, 'users', user.uid, 'regularIncomes', template.id);
        transaction.update(incomeRef, {
          nextPaymentDate: Timestamp.fromDate(newNextPaymentDate)
        });

        // Add to linked bank account if it exists
        if (template.linkedBankAccountId) {
          const bankRef = doc(db, 'users', user.uid, 'accounts', template.linkedBankAccountId);
          const bankSnap = await transaction.get(bankRef);
          if (bankSnap.exists()) {
            const currentBalance = bankSnap.data().balance || 0;
            transaction.update(bankRef, {
              balance: currentBalance + template.amount
            });
          }
        }
      });

      alert(`${template.name} を収入として記録しました。`);
    } catch (err) {
      console.error(err);
      alert('収入の記録に失敗しました。');
    }
  };

  if (loading) return <p>読み込み中...</p>;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">今月の定期収入</h2>
      {error && <p className="text-red-500">{error}</p>}
      {upcomingIncomes.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">今月受け取る予定の定期収入はありません。</p>
      ) : (
        <ul className="space-y-3">
          {upcomingIncomes.map(template => {
            const paymentDate = template.nextPaymentDate.toDate();
            const isEditing = editingId === template.id;
            return (
              <li key={template.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{template.name}</p>
                    <p className="text-sm">
                      {paymentDate.toLocaleDateString()} - ¥{template.amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => isEditing ? handleEditCancel() : handleEditClick(template)}
                      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded text-sm"
                    >
                      {isEditing ? 'キャンセル' : '編集'}
                    </button>
                    <button
                      onClick={() => handleRecordIncome(template)}
                      className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-sm"
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
                        <input
                          type="text"
                          value={editFormData.name}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">差引支給額</label>
                        <input
                          type="number"
                          value={editFormData.amount}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, amount: e.target.value }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">課税合計</label>
                        <input
                          type="number"
                          value={editFormData.totalTaxableAmount}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, totalTaxableAmount: e.target.value }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">カテゴリー</label>
                        <select
                          value={editFormData.category}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, category: e.target.value }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                        >
                          <option value="">カテゴリーを選択</option>
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">次回受取日</label>
                        <input
                          type="date"
                          value={editFormData.nextPaymentDate}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, nextPaymentDate: e.target.value }))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black"
                        />
                      </div>
                    </div>
                    {editError && <p className="text-red-500 text-xs">{editError}</p>}
                    <button
                      onClick={() => handleEditSave(template)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded text-sm"
                    >
                      保存する
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RegularIncomeProcessor;
