import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

interface StoreChartProps {
  month: Date;
  showTransfers?: boolean;
  paymentMethodFilter?: string[];
}

interface StoreData {
  name: string;
  total: number;
}

const StoreChart = ({ month, showTransfers = false, paymentMethodFilter = [] }: StoreChartProps) => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );

    const unsubscribe = onSnapshot(expensesQuery, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(expensesData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('支出データの読み込みに失敗しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, month]);

  const { storeData } = useMemo(() => {
    if (expenses.length === 0) return { storeData: [], totalSum: 0 };

    const storeMap = new Map<string, number>();
    expenses.forEach(expense => {
      if (!showTransfers && expense.isTransfer) return;
      if (paymentMethodFilter.length > 0 && !paymentMethodFilter.includes(expense.paymentMethodId)) return;
      const storeName = expense.store?.trim() || '店名なし';
      const currentTotal = storeMap.get(storeName) || 0;
      storeMap.set(storeName, currentTotal + expense.amount);
    });

    const data = Array.from(storeMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
      
    return { storeData: data };
  }, [expenses, showTransfers, paymentMethodFilter]);

  if (loading) return <p>グラフを読み込んでいます...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (storeData.length === 0) return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">店名・サービス別支出</h3>
      <p className="text-center text-gray-500 dark:text-gray-400 p-8">この月のデータはありません。</p>
    </div>
  );

  const height = Math.max(400, storeData.length * 40);

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md overflow-hidden">
      <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">店名・サービス別支出</h3>
      <div style={{ width: '100%', height: height, overflowX: 'auto' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={storeData}
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(value) => `¥${value.toLocaleString()}`} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="total" name="支出" fill="#8884d8" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StoreChart;
