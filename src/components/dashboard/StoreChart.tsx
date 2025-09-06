import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface StoreChartProps {
  month: Date;
}

interface StoreData {
  name: string;
  total: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const StoreChart = ({ month }: StoreChartProps) => {
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

  const { storeData, totalSum } = useMemo(() => {
    if (expenses.length === 0) return { storeData: [], totalSum: 0 };

    const storeMap = new Map<string, number>();
    let sum = 0;
    expenses.forEach(expense => {
      const storeName = expense.store?.trim() || '店名なし';
      const currentTotal = storeMap.get(storeName) || 0;
      storeMap.set(storeName, currentTotal + expense.amount);
      sum += expense.amount;
    });

    const data = Array.from(storeMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
      
    return { storeData: data, totalSum: sum };
  }, [expenses]);

  if (loading) return <p>グラフを読み込んでいます...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (storeData.length === 0) return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-bold text-gray-800 mb-4">店名・サービス別支出</h3>
      <p>この月のデータはありません。</p>
    </div>
  );

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-bold text-gray-800 mb-4">店名・サービス別支出</h3>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8" style={{ minHeight: '400px' }}>
        <div>
          <h4 className="text-md font-semibold text-center mb-4">支出合計</h4>
          <ResponsiveContainer width="100%" height={300 + storeData.length * 10}>
            <BarChart data={storeData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => [`¥${value.toLocaleString()}`, '合計']} />
              <Legend />
              <Bar dataKey="total" name="支出額" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 className="text-md font-semibold text-center mb-4">支出割合</h4>
          <ResponsiveContainer width="100%" height={500}>
            <PieChart>
              <Pie
                data={storeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={180}
                fill="#8884d8"
                dataKey="total"
                nameKey="name"
              >
                {storeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default StoreChart;
