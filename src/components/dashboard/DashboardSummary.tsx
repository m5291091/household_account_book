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
  const [total, setTotal] = useState(0);
  const [byPaymentMethod, setByPaymentMethod] = useState<Record<string, number>>({});
  const [paymentMethodNames, setPaymentMethodNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
    const unsubPm = onSnapshot(pmQuery, snapshot => {
      const names = new Map();
      snapshot.forEach(doc => names.set(doc.id, doc.data().name));
      setPaymentMethodNames(names);
    });

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );

    const unsubExpenses = onSnapshot(expensesQuery, snapshot => {
      let currentTotal = 0;
      const byMethod: Record<string, number> = {};
      snapshot.forEach(doc => {
        const expense = doc.data() as Omit<Expense, 'id'>;
        currentTotal += expense.amount;
        byMethod[expense.paymentMethodId] = (byMethod[expense.paymentMethodId] || 0) + expense.amount;
      });
      setTotal(currentTotal);
      setByPaymentMethod(byMethod);
      setLoading(false);
    });

    return () => {
      unsubPm();
      unsubExpenses();
    };
  }, [user, month]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md animate-pulse">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">今月のサマリー</h2>
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          <div className="h-12 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">今月のサマリー</h2>
      <div className="space-y-4">
        <div>
          <p className="text-gray-600">総支出額</p>
          <p className="text-3xl font-bold">¥{total.toLocaleString()}</p>
        </div>
        <hr/>
        <div>
          <p className="text-gray-600 mb-2">支払い方法別の合計</p>
          <ul className="space-y-1">
            {Object.entries(byPaymentMethod).map(([id, amount]) => (
              <li key={id} className="flex justify-between">
                <span>{paymentMethodNames.get(id) || '不明'}</span>
                <span className="font-medium">¥{amount.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DashboardSummary;