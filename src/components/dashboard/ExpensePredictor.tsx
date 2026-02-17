"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, Timestamp, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { startOfMonth, endOfMonth, subMonths, format, addMonths } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const ExpensePredictor = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyMonths, setHistoryMonths] = useState<number>(6);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const today = new Date();
    const startDate = startOfMonth(subMonths(today, historyMonths));
    const endDate = endOfMonth(today);

    const fetchData = async () => {
      try {
        const expensesQuery = query(
          collection(db, 'users', user.uid, 'expenses'),
          where('date', '>=', Timestamp.fromDate(startDate)),
          where('date', '<=', Timestamp.fromDate(endDate)),
          orderBy('date', 'asc')
        );
        const snapshot = await getDocs(expensesQuery);
        const data = snapshot.docs.map(doc => doc.data() as Expense);
        setExpenses(data);
      } catch (err) {
        console.error(err);
        setError('データの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, historyMonths]);

  const { chartData, prediction, trend } = useMemo(() => {
    if (expenses.length === 0) return { chartData: [], prediction: 0, trend: 'stable' };

    // 1. Group by month
    const monthlyTotals = new Map<string, number>();
    expenses.forEach(exp => {
      const monthKey = format(exp.date.toDate(), 'yyyy-MM');
      monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + exp.amount);
    });

    // 2. Prepare data points for regression
    // x = 0 (oldest month) to x = historyMonths (current month)
    const sortedKeys = Array.from(monthlyTotals.keys()).sort();
    const points = sortedKeys.map((key, index) => ({
      x: index,
      y: monthlyTotals.get(key) || 0,
      month: key
    }));

    if (points.length < 2) return { chartData: [], prediction: 0, trend: 'insufficient_data' };

    // 3. Linear Regression Calculation
    const n = points.length;
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    const sumXY = points.reduce((acc, p) => acc + (p.x * p.y), 0);
    const sumXX = points.reduce((acc, p) => acc + (p.x * p.x), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 4. Generate Chart Data
    const displayData = points.map(p => ({
      name: p.month,
      実績: p.y,
      トレンド: Math.round(slope * p.x + intercept)
    }));

    // 5. Predict Next Month
    const nextX = points.length;
    const nextMonthDate = addMonths(new Date(sortedKeys[sortedKeys.length - 1]), 1);
    const predictedAmount = Math.max(0, Math.round(slope * nextX + intercept)); // No negative prediction

    displayData.push({
      name: format(nextMonthDate, 'yyyy-MM(予測)'),
      実績: 0, // Placeholder
      トレンド: predictedAmount
    });

    const trendType = slope > 1000 ? 'increasing' : slope < -1000 ? 'decreasing' : 'stable';

    return { chartData: displayData, prediction: predictedAmount, trend: trendType };
  }, [expenses]);

  if (loading) return <div className="bg-white p-6 rounded-lg shadow-md">分析中...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">AI支出予測（単回帰分析）</h2>
        <select
          value={historyMonths}
          onChange={(e) => setHistoryMonths(Number(e.target.value))}
          className="p-2 border rounded-md"
        >
          <option value={3}>過去3ヶ月</option>
          <option value={6}>過去6ヶ月</option>
          <option value={12}>過去1年</option>
        </select>
      </div>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-indigo-50 p-4 rounded-lg text-center">
          <p className="text-sm text-gray-600 mb-1">来月の予想支出</p>
          <p className="text-3xl font-bold text-indigo-600">¥{prediction.toLocaleString()}</p>
        </div>
        <div className={`p-4 rounded-lg text-center ${
          trend === 'increasing' ? 'bg-red-50 text-red-600' : 
          trend === 'decreasing' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-600'
        }`}>
          <p className="text-sm mb-1">トレンド判定</p>
          <p className="text-xl font-bold">
            {trend === 'increasing' ? '増加傾向 ⚠️' : 
             trend === 'decreasing' ? '減少傾向 👏' : '横ばい ->'}
          </p>
        </div>
      </div>

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" padding={{ left: 30, right: 30 }} />
            <YAxis />
            <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
            <Legend />
            <Line type="monotone" dataKey="実績" stroke="#8884d8" strokeWidth={2} activeDot={{ r: 8 }} />
            <Line type="monotone" dataKey="トレンド" stroke="#82ca9d" strokeDasharray="5 5" strokeWidth={2} />
            <ReferenceLine x={chartData[chartData.length - 2]?.name} stroke="red" strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 mt-4 text-center">
        ※ 過去の支出データに基づき、線形回帰モデルを用いて来月の支出を統計的に予測しています。
      </p>
    </div>
  );
};

export default ExpensePredictor;
