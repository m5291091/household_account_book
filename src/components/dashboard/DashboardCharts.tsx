"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff4d4d', '#4dff4d', '#4d4dff'];

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null; // Hide label if too small

  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

interface DashboardChartsProps {
  month: Date;
  showTransfers?: boolean;
  paymentMethodFilter?: string[];
}

const DashboardCharts = ({ month, showTransfers = false, paymentMethodFilter = [] }: DashboardChartsProps) => {
  const { user } = useAuth();
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const catQuery = query(collection(db, 'users', user.uid, 'categories'));
    const unsubCat = onSnapshot(catQuery, snapshot => {
      const names = new Map<string, string>();
      snapshot.forEach(doc => names.set(doc.id, doc.data().name));
      setCategoryNames(names);
    });

    return () => unsubCat();
  }, [user]);

  useEffect(() => {
    if (!user || categoryNames.size === 0) return;

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );

    const unsubExpenses = onSnapshot(expensesQuery, snapshot => {
      setRawExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubExpenses();
  }, [user, month, categoryNames]);

  const categoryData = useMemo(() => {
    const byCategory: Record<string, number> = {};
    rawExpenses.forEach(expense => {
      if (!showTransfers && expense.isTransfer) return;
      if (paymentMethodFilter.length > 0 && !paymentMethodFilter.includes(expense.paymentMethodId)) return;
      byCategory[expense.categoryId] = (byCategory[expense.categoryId] || 0) + expense.amount;
    });
    return Array.from(categoryNames.entries())
      .map(([id, name]) => ({ name, value: byCategory[id] || 0 }))
      .filter(item => item.value > 0);
  }, [rawExpenses, categoryNames, showTransfers, paymentMethodFilter]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">カテゴリー別支出</h2>
      <div style={{ width: '100%', height: 500 }}>
        {categoryData.length > 0 ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={180}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-400">この月のデータはありません。</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardCharts;
