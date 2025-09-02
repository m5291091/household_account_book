"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const PaymentMethodChart = ({ month }: { month: Date }) => {
  const { user, loading: authLoading } = useAuth();
  const [chartData, setChartData] = useState<{ name: string; total: number }[]>([]);
  const [paymentMethodNames, setPaymentMethodNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
    const unsubPm = onSnapshot(pmQuery, pmSnapshot => {
      const names = new Map<string, string>();
      pmSnapshot.forEach(doc => names.set(doc.id, doc.data().name));
      setPaymentMethodNames(names);
    });

    return () => unsubPm();
  }, [user]);

  useEffect(() => {
    if (!user || paymentMethodNames.size === 0) return;
    
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd))
    );

    const unsubExpenses = onSnapshot(expensesQuery, expensesSnapshot => {
      const byMethod: Record<string, number> = {};
      expensesSnapshot.forEach(doc => {
        const expense = doc.data();
        byMethod[expense.paymentMethodId] = (byMethod[expense.paymentMethodId] || 0) + expense.amount;
      });
      
      const data = Array.from(paymentMethodNames.entries()).map(([id, name]) => ({
        name: name,
        total: byMethod[id] || 0,
      }));
      setChartData(data);
      setLoading(false);
    });

    return () => unsubExpenses();
  }, [user, month, paymentMethodNames]);

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
      <h2 className="text-2xl font-bold mb-4 text-gray-800">支払い方法別 合計</h2>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(value) => `¥${(value as number).toLocaleString()}`} />
            <YAxis type="category" dataKey="name" width={80} />
            <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="total" fill="#82ca9d" name="合計金額" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PaymentMethodChart;