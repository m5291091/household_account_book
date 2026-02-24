import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, Timestamp, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { startOfMonth, endOfMonth, subMonths, format, addMonths } from 'date-fns';

interface PredictionResult {
  prediction: number;
  trend: 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';
  chartData: { name: string; 実績: number; トレンド: number }[];
  loading: boolean;
  error: string | null;
}

export const useExpensePrediction = (historyMonths: number = 6): PredictionResult => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const result = useMemo(() => {
    if (expenses.length === 0) return { chartData: [], prediction: 0, trend: 'stable' as const };

    // 1. Group by month
    const monthlyTotals = new Map<string, number>();
    expenses.forEach(exp => {
      const monthKey = format(exp.date.toDate(), 'yyyy-MM');
      monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + exp.amount);
    });

    // 2. Prepare data points for regression
    const sortedKeys = Array.from(monthlyTotals.keys()).sort();
    const points = sortedKeys.map((key, index) => ({
      x: index,
      y: monthlyTotals.get(key) || 0,
      month: key
    }));

    if (points.length < 2) return { chartData: [], prediction: 0, trend: 'insufficient_data' as const };

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
      実績: 0,
      トレンド: predictedAmount
    });

    const trendType: 'increasing' | 'decreasing' | 'stable' = slope > 1000 ? 'increasing' : slope < -1000 ? 'decreasing' : 'stable';

    return { chartData: displayData, prediction: predictedAmount, trend: trendType };
  }, [expenses]);

  return { ...result, loading, error };
};
