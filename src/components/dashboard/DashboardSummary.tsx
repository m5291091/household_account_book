// /Users/alphabetagamma/work/APP/household_account_book/src/components/dashboard/DashboardSummary.tsx
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { startOfMonth, endOfMonth } from 'date-fns';

import Skeleton from '@/components/ui/Skeleton';

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
      <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">今月のサマリー</h2>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
             <Skeleton className="h-6 w-20" />
             <Skeleton className="h-8 w-32" />
          </div>
          <div className="flex justify-between items-center">
             <Skeleton className="h-6 w-20" />
             <Skeleton className="h-8 w-32" />
          </div>
          <hr className="border-gray-200 dark:border-gray-700" />
          <div className="flex justify-between items-center">
             <Skeleton className="h-6 w-20" />
             <Skeleton className="h-10 w-40" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">今月のサマリー</h2>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-gray-600 dark:text-gray-300">合計収入</p>
          <p className="text-2xl font-semibold text-green-600">¥{totalIncome.toLocaleString()}</p>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-gray-600 dark:text-gray-300">合計支出</p>
          <p className="text-2xl font-semibold text-red-600">¥{totalExpenses.toLocaleString()}</p>
        </div>
        <hr/>
        <div className="flex justify-between items-center">
          <p className="text-gray-600 dark:text-gray-300 font-bold">収支</p>
          <p className={`text-3xl font-bold ${netBalance >= 0 ? 'text-gray-800 dark:text-gray-100' : 'text-red-600'}`}>
            ¥{netBalance.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardSummary;