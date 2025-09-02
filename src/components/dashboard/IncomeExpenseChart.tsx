
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const IncomeExpenseChart = ({ month }: { month: Date }) => {
  const { user } = useAuth();
  const [chartData, setChartData] = useState<{ name: string; 収入: number; 支出: number; }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    let totalExpenses = 0;
    let totalIncome = 0;

    const updateChartData = () => {
        setChartData([{ name: '月次', 収入: totalIncome, 支出: totalExpenses }]);
    };

    // Fetch expenses
    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );
    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      totalExpenses = snapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
      updateChartData();
    });

    // Fetch incomes
    const incomesQuery = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );
    const unsubIncomes = onSnapshot(incomesQuery, (snapshot) => {
      totalIncome = snapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
      updateChartData();
      setLoading(false);
    });

    return () => {
      unsubExpenses();
      unsubIncomes();
    };
  }, [user, month]);

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
      <h3 className="text-xl font-bold text-gray-800 mb-4">収入 vs 支出</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis tickFormatter={(value) => `¥${(value as number / 1000)}k`} />
          <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
          <Legend />
          <Bar dataKey="収入" fill="#4ade80" />
          <Bar dataKey="支出" fill="#f87171" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default IncomeExpenseChart;
