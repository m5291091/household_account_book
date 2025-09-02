"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Sector } from 'recharts';

interface StoreChartProps {
  month: Date;
}

interface StoreData {
  name: string;
  total: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill}>
        {payload.name}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333">{`¥${value.toLocaleString()}`}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">
        {`( ${(percent * 100).toFixed(2)}% )`}
      </text>
    </g>
  );
};


const StoreChart = ({ month }: StoreChartProps) => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

  const storeData = useMemo<StoreData[]>(() => {
    if (expenses.length === 0) return [];

    const storeMap = new Map<string, number>();
    expenses.forEach(expense => {
      const storeName = expense.store?.trim() || '店名なし';
      const currentTotal = storeMap.get(storeName) || 0;
      storeMap.set(storeName, currentTotal + expense.amount);
    });

    return Array.from(storeMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

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
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                data={storeData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                dataKey="total"
                onMouseEnter={onPieEnter}
              >
                {storeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default StoreChart;
