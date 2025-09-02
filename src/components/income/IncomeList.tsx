
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, deleteDoc, doc, orderBy, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Income } from '@/types/Income';
import { format } from 'date-fns';
import Link from 'next/link';

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
    if (!user) return;
    setLoading(true);

    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

    const incomesQuery = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd)),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(incomesQuery, (snapshot) => {
      setIncomes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Income)));
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('収入履歴の読み込みに失敗しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, month]);

  const handleDelete = async (id: string) => {
    if (!user || !confirm('この収入を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'incomes', id));
    } catch (err) {
      console.error(err);
      setError('収入の削除に失敗しました。');
    }
  };

  if (loading) return <p>収入履歴を読み込んでいます...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">収入履歴</h2>
      {incomes.length === 0 ? (
        <p>この月の収入はありません。</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {incomes.map(income => (
            <li key={income.id} className="py-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{format(income.date.toDate(), 'M月d日')} - {income.source}</p>
                <p className="text-xl font-bold">¥{income.amount.toLocaleString()}</p>
                {income.memo && <p className="text-sm text-gray-500 mt-1">メモ: {income.memo}</p>}
              </div>
              <div className="flex items-center space-x-2">
                 <Link href={`/dashboard/edit-income/${income.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編集</Link>
                 <button onClick={() => handleDelete(income.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">削除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default IncomeList;
