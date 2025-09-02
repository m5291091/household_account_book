// /Users/alphabetagamma/work/APP/household_account_book/src/components/dashboard/DashboardCharts.tsx
"use client";

import { useState, useEffect } from 'react';
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

const DashboardCharts = ({ month }: { month: Date }) => {
  const { user } = useAuth();
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
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
      const byCategory: Record<string, number> = {};
      snapshot.forEach(doc => {
        const expense = doc.data();
        byCategory[expense.categoryId] = (byCategory[expense.categoryId] || 0) + expense.amount;
      });
      
      const chartData = Array.from(categoryNames.entries()).map(([id, name]) => ({
        name: name,
        value: byCategory[id] || 0,
      })).filter(item => item.value > 0); // Only show categories with expenses

      setCategoryData(chartData);
      setLoading(false);
    });

    return () => unsubExpenses();
  }, [user, month, categoryNames]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">カテゴリー別支出</h2>
      <div style={{ width: '100%', height: 300 }}>
        {categoryData.length > 0 ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={100}
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
            <p className="text-gray-500">この月のデータはありません。</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardCharts;
