// /Users/alphabetagamma/work/APP/household_account_book/src/components/dashboard/DashboardSummary.tsx
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { startOfMonth, endOfMonth } from 'date-fns';

const DashboardSummary = ({ month }: { month: Date }) => {
  const { user, loading: authLoading } = useAuth();
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    // Fetch expenses
    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );
    const unsubExpenses = onSnapshot(expensesQuery, snapshot => {
      const total = snapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
      setTotalExpenses(total);
    });

    // Fetch incomes
    const incomesQuery = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );
    const unsubIncomes = onSnapshot(incomesQuery, snapshot => {
      const total = snapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
      setTotalIncome(total);
      setLoading(false); // Consider both fetches complete
    });

    return () => {
      unsubExpenses();
      unsubIncomes();
    };
  }, [user, month, authLoading]);

  const netBalance = totalIncome - totalExpenses;

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md animate-pulse">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">今月のサマリー</h2>
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">今月のサマリー</h2>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-gray-600">合計収入</p>
          <p className="text-2xl font-semibold text-green-600">¥{totalIncome.toLocaleString()}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-gray-600">合計支出</p>
          <p className="text-2xl font-semibold text-red-600">¥{totalExpenses.toLocaleString()}</p>
        </div>
        <hr/>
        <div className="flex justify-between items-center">
          <p className="text-gray-600 font-bold">収支</p>
          <p className={`text-3xl font-bold ${netBalance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
            ¥{netBalance.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardSummary;