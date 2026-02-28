// /Users/alphabetagamma/work/APP/household_account_book/src/components/dashboard/DashboardSummary.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useExpenses } from '@/hooks/useExpenses';
import { SavingsGoal } from '@/types/SavingsGoal';

import Skeleton from '@/components/ui/Skeleton';

const DashboardSummary = ({ month }: { month: Date }) => {
  const { user, loading: authLoading } = useAuth();
  const [totalIncome, setTotalIncome] = useState(0);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [incomeError, setIncomeError] = useState<string | null>(null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);

  const monthStart = useMemo(() => startOfMonth(month), [month]);
  const monthEnd = useMemo(() => endOfMonth(month), [month]);
  const { expenses: allExpensesWithTransfers, loading: expensesLoading, error: expensesError } = useExpenses(user?.uid, monthStart, monthEnd, true);
  const totalExpenses = useMemo(
    () => allExpensesWithTransfers.filter(e => !e.isTransfer).reduce((sum, e) => sum + e.amount, 0),
    [allExpensesWithTransfers]
  );
  const totalTransferExcluded = useMemo(
    () => allExpensesWithTransfers.filter(e => e.isTransfer).reduce((sum, e) => sum + e.amount, 0),
    [allExpensesWithTransfers]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setTotalIncome(0);
      setIncomeLoading(false);
      return;
    }
    setIncomeLoading(true);
    setIncomeError(null);

    const incomesQuery = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );
    const unsubIncomes = onSnapshot(incomesQuery, snapshot => {
      const total = snapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
      setTotalIncome(total);
      setIncomeLoading(false);
    }, (err) => {
      console.error(err);
      setIncomeError('収入データの取得に失敗しました。');
      setIncomeLoading(false);
    });

    const unsubGoals = onSnapshot(
      query(collection(db, 'users', user.uid, 'savingsGoals'), orderBy('updatedAt', 'desc')),
      s => setSavingsGoals(s.docs.map(d => ({ id: d.id, ...d.data() } as SavingsGoal)))
    );

    return () => { unsubIncomes(); unsubGoals(); };
  }, [user, authLoading, monthStart, monthEnd]);

  const loading = authLoading || expensesLoading || incomeLoading;
  const error = expensesError || incomeError;
  if (error) return <p className="text-red-500">{error}</p>;

  const netBalance = totalIncome - totalExpenses;

  const totalSavings = savingsGoals.reduce((sum, goal) => {
    if (goal.type === 'fixed') return sum + goal.amount;
    return sum + Math.round(totalIncome * (goal.percentage / 100));
  }, 0);

  const netAfterSavings = netBalance - totalSavings;

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
          <div className="text-right">
            <p className="text-2xl font-semibold text-red-600">¥{totalExpenses.toLocaleString()}</p>
            {totalTransferExcluded > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                振替除外: ¥{totalTransferExcluded.toLocaleString()}（集計に含まれません）
              </p>
            )}
          </div>
        </div>
        <hr/>
        <div className="flex justify-between items-center">
          <p className="text-gray-600 dark:text-gray-300 font-bold">収支</p>
          <p className={`text-3xl font-bold ${netBalance >= 0 ? 'text-gray-800 dark:text-gray-100' : 'text-red-600'}`}>
            ¥{netBalance.toLocaleString()}
          </p>
        </div>
        {totalSavings > 0 && (
          <>
            <div className="flex justify-between items-center">
              <p className="text-gray-600 dark:text-gray-300">貯金目標額</p>
              <p className="text-2xl font-semibold text-blue-600">− ¥{totalSavings.toLocaleString()}</p>
            </div>
            <hr/>
            <div className="flex justify-between items-center">
              <p className="text-gray-600 dark:text-gray-300 font-bold">貯金後の収支</p>
              <p className={`text-3xl font-bold ${netAfterSavings >= 0 ? 'text-gray-800 dark:text-gray-100' : 'text-red-600'}`}>
                ¥{netAfterSavings.toLocaleString()}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardSummary;
