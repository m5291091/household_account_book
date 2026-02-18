"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth } from 'date-fns';
import { Category } from '@/types/Category';
import { Expense } from '@/types/Expense';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BudgetStatusProps {
  month: Date;
}

interface ChartData {
  name: string;
  spent: number;
  remaining: number;
  budget: number;
}

const BudgetStatus = ({ month }: BudgetStatusProps) => {
  const { user, loading: authLoading } = useAuth();
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    const catQuery = query(collection(db, 'users', user.uid, 'categories'), where('budget', '>', 0));
    const unsubCategories = onSnapshot(catQuery, catSnapshot => {
      const budgetedCategories = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));

      if (budgetedCategories.length === 0) {
        setChartData([]);
        setLoading(false);
        return;
      }

      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const expensesQuery = query(
        collection(db, 'users', user.uid, 'expenses'),
        where('date', '>=', Timestamp.fromDate(monthStart)),
        where('date', '<=', Timestamp.fromDate(monthEnd))
      );

      const unsubExpenses = onSnapshot(expensesQuery, expSnapshot => {
        const spendingByCat: { [key: string]: number } = {};
        expSnapshot.forEach(doc => {
          const expense = doc.data() as Expense;
          spendingByCat[expense.categoryId] = (spendingByCat[expense.categoryId] || 0) + expense.amount;
        });

        const data = budgetedCategories.map(cat => {
          const spent = spendingByCat[cat.id] || 0;
          const budget = cat.budget || 0;
          const remaining = Math.max(0, budget - spent);
          return { name: cat.name, spent, remaining, budget };
        });

        setChartData(data);
        setLoading(false);
      });

      return () => unsubExpenses();
    });

    return () => unsubCategories();
  }, [user, month]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }
  
  if (chartData.length === 0) {
    return (
       <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">今月の予算状況</h2>
        <p className="text-gray-500 dark:text-gray-400">予算が設定されているカテゴリーはありません。</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">今月の予算状況</h2>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            layout="vertical"
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(value) => `¥${value.toLocaleString()}`} />
            <YAxis type="category" dataKey="name" width={80} />
            <Tooltip formatter={(value: number, name: string) => [`¥${value.toLocaleString()}`, name === 'spent' ? '支出済' : '残り']} />
            <Legend />
            <Bar dataKey="spent" stackId="a" fill="#ef4444" name="支出済" />
            <Bar dataKey="remaining" stackId="a" fill="#d1d5db" name="残り" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BudgetStatus;