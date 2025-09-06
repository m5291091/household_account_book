// /src/components/income/IncomeList.tsx
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, doc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Income } from '@/types/Income';
import { format } from 'date-fns';
import { startOfMonth, endOfMonth } from 'date-fns';

interface IncomeListProps {
  month: Date;
  onEditIncome: (income: Income) => void;
}

const IncomeList = ({ month, onEditIncome }: IncomeListProps) => {
  const { user } = useAuth();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const q = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const incomesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Income))
        .sort((a, b) => b.date.toMillis() - a.date.toMillis());
      setIncomes(incomesData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('収入データの読み込みに失敗しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, month]);

  const handleDelete = async (id: string) => {
    if (confirm('この収入履歴を削除してもよろしいですか？')) {
      try {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'incomes', id));
      } catch (err) {
        console.error(err);
        alert('削除に失敗しました。');
      }
    }
  };

  if (loading) return <p className="text-center">読み込み中...</p>;
  if (error) return <p className="text-center text-red-500">{error}</p>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">収入一覧</h2>
      {incomes.length === 0 ? (
        <p className="text-gray-500">この月の収入データはありません。</p>
      ) : (
        <ul className="space-y-4">
          {incomes.map(income => (
            <li key={income.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-500">{format(income.date.toDate(), 'yyyy/MM/dd')}</p>
                  <p className="font-semibold text-lg">{income.source} ({income.category})</p>
                  {income.memo && <p className="text-sm text-gray-600 mt-1">{income.memo}</p>}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="font-bold text-xl text-green-600">¥{income.amount.toLocaleString()}</p>
                  {income.totalTaxableAmount && (
                    <p className="text-sm text-gray-500">課税合計: ¥{income.totalTaxableAmount.toLocaleString()}</p>
                  )}
                </div>
              </div>
              <div className="text-right mt-2 space-x-2">
                <button
                  onClick={() => onEditIncome(income)}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(income.id)}
                  className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default IncomeList;