// /src/components/income/IncomeList.tsx
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, doc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Income } from '@/types/Income';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface IncomeListProps {
  onEditIncome: (income: Income) => void;
  month: Date;
}

const IncomeList = ({ onEditIncome, month }: IncomeListProps) => {
  const { user } = useAuth();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState(format(startOfMonth(month), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(month), 'yyyy-MM-dd'));

  useEffect(() => {
    setStartDate(format(startOfMonth(month), 'yyyy-MM-dd'));
    setEndDate(format(endOfMonth(month), 'yyyy-MM-dd'));
  }, [month]);

  useEffect(() => {
    if (!user || !startDate || !endDate) {
      setIncomes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(new Date(startDate))),
      where('date', '<=', Timestamp.fromDate(new Date(endDate)))
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
  }, [user, startDate, endDate]);

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

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">収入一覧</h2>
      
      {/* Date Range Filter */}
      <div className="flex items-center space-x-2 mb-6">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md" />
        <span className="text-gray-500 dark:text-gray-400">〜</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md" />
      </div>

      {loading && <p className="text-center">読み込み中...</p>}
      {error && <p className="text-center text-red-500">{error}</p>}
      
      {!loading && !error && (
        incomes.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">指定された期間の収入データはありません。</p>
        ) : (
          <ul className="space-y-4">
            {incomes.map(income => (
              <li key={income.id} className="p-4 border rounded-lg hover:bg-gray-50 dark:bg-gray-900 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{format(income.date.toDate(), 'yyyy/MM/dd')}</p>
                    <p className="font-semibold text-lg">{income.source} ({income.category})</p>
                    {income.memo && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{income.memo}</p>}
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="font-bold text-xl text-green-600">¥{income.amount.toLocaleString()}</p>
                    {income.totalTaxableAmount && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">課税合計: ¥{income.totalTaxableAmount.toLocaleString()}</p>
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
        )
      )}
    </div>
  );
};

export default IncomeList;
