"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth } from 'date-fns';
import { SavingsGoal } from '@/types/SavingsGoal';
import { Account } from '@/types/Account';

interface SavingsGoalStatusProps {
  month: Date;
}

const SavingsGoalStatus = ({ month }: SavingsGoalStatusProps) => {
  const { user, loading: authLoading } = useAuth();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);

  const monthStart = useMemo(() => startOfMonth(month), [month]);
  const monthEnd = useMemo(() => endOfMonth(month), [month]);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    const unsubAccounts = onSnapshot(
      query(collection(db, 'users', user.uid, 'accounts')),
      s => setAccounts(s.docs.map(d => ({ id: d.id, ...d.data() } as Account)))
    );

    const unsubGoals = onSnapshot(
      query(collection(db, 'users', user.uid, 'savingsGoals'), orderBy('updatedAt', 'desc')),
      s => {
        setGoals(s.docs.map(d => ({ id: d.id, ...d.data() } as SavingsGoal)));
        setLoading(false);
      }
    );

    const incomesQuery = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );
    const unsubIncomes = onSnapshot(incomesQuery, snapshot => {
      const total = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount as number), 0);
      setTotalIncome(total);
    });

    return () => { unsubAccounts(); unsubGoals(); unsubIncomes(); };
  }, [user, authLoading, monthStart, monthEnd]);

  if (loading || goals.length === 0) return null;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">今月の貯金目標</h2>
      <ul className="space-y-4">
        {goals.map(goal => {
          const targetAmount =
            goal.type === 'fixed'
              ? goal.amount
              : Math.round(totalIncome * (goal.percentage / 100));

          const linkedAccount = accounts.find(a => a.id === goal.linkedAccountId);

          return (
            <li key={goal.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 border border-gray-100 dark:border-gray-700 rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏦</span>
                  <span className="font-bold text-gray-800 dark:text-gray-100">{goal.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-700 dark:text-blue-200">
                    {goal.type === 'fixed' ? '固定額' : `収入の ${goal.percentage}%`}
                  </span>
                </div>
                {linkedAccount && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    貯金先: <span className="font-medium text-gray-700 dark:text-gray-200">{linkedAccount.name}</span>
                  </p>
                )}
                {goal.type === 'percentage' && totalIncome === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ※ 今月の収入が記録されていないため計算できません
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">
                  ¥{targetAmount.toLocaleString()}
                </p>
                {goal.type === 'percentage' && totalIncome > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    収入 ¥{totalIncome.toLocaleString()} × {goal.percentage}%
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SavingsGoalStatus;
