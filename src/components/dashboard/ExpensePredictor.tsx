// /src/components/dashboard/ExpensePredictor.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { Category } from '@/types/Category';
import { startOfMonth, endOfMonth, subMonths, getMonth, getDate, getDaysInMonth } from 'date-fns';

interface Prediction {
  categoryId: string;
  categoryName: string;
  predictedAmount: number;
  currentAmount: number;
  status: 'on_track' | 'over_spending' | 'at_risk';
}

const ExpensePredictor = ({ month }: { month: Date }) => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // Fetch last 3 months of expenses + current month
    const startDate = startOfMonth(subMonths(month, 3));
    const endDate = endOfMonth(month);

    const fetchData = async () => {
      try {
        // Fetch categories
        const catQuery = query(collection(db, 'users', user.uid, 'categories'));
        const catSnapshot = await getDocs(catQuery);
        const catMap = new Map<string, string>();
        catSnapshot.forEach(doc => catMap.set(doc.id, doc.data().name));
        setCategories(catMap);

        // Fetch expenses
        const expensesQuery = query(
          collection(db, 'users', user.uid, 'expenses'),
          where('date', '>=', Timestamp.fromDate(startDate)),
          where('date', '<=', Timestamp.fromDate(endDate))
        );
        const expenseSnapshot = await getDocs(expensesQuery);
        const expensesData = expenseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
        setExpenses(expensesData);

      } catch (err) {
        console.error(err);
        setError('予測データの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, month]);

  const predictions = useMemo((): Prediction[] => {
    if (expenses.length === 0 || categories.size === 0) return [];

    const monthlyCategoryTotals: Map<number, Map<string, number>> = new Map();

    // Group expenses by month and category
    expenses.forEach(expense => {
      const expenseMonth = getMonth(expense.date.toDate());
      if (!monthlyCategoryTotals.has(expenseMonth)) {
        monthlyCategoryTotals.set(expenseMonth, new Map());
      }
      const categoryMap = monthlyCategoryTotals.get(expenseMonth)!;
      const currentTotal = categoryMap.get(expense.categoryId) || 0;
      categoryMap.set(expense.categoryId, currentTotal + expense.amount);
    });

    const currentMonthIndex = getMonth(month);
    const previousMonths = [
      getMonth(subMonths(month, 1)),
      getMonth(subMonths(month, 2)),
      getMonth(subMonths(month, 3)),
    ];

    const predictionsData: Prediction[] = [];

    categories.forEach((categoryName, categoryId) => {
      // Calculate average of last 3 months
      let totalOfLast3Months = 0;
      let monthsWithData = 0;
      previousMonths.forEach(mIndex => {
        if (monthlyCategoryTotals.has(mIndex) && monthlyCategoryTotals.get(mIndex)!.has(categoryId)) {
          totalOfLast3Months += monthlyCategoryTotals.get(mIndex)!.get(categoryId)!;
          monthsWithData++;
        }
      });
      
      if (monthsWithData === 0) return; // Skip if no historical data

      const predictedAmount = totalOfLast3Months / monthsWithData;
      const currentAmount = monthlyCategoryTotals.get(currentMonthIndex)?.get(categoryId) || 0;

      // Determine status
      const today = new Date();
      const dayOfMonth = getDate(today);
      const daysInMonth = getDaysInMonth(month);
      const monthProgress = (getMonth(month) === getMonth(today)) ? dayOfMonth / daysInMonth : 1;
      
      const idealSpending = predictedAmount * monthProgress;
      let status: Prediction['status'] = 'on_track';
      if (currentAmount > idealSpending * 1.2) {
        status = 'at_risk';
      } else if (currentAmount > idealSpending) {
        status = 'over_spending';
      }

      if (currentAmount > 0) {
        predictionsData.push({ categoryId, categoryName, predictedAmount, currentAmount, status });
      }
    });
    
    return predictionsData.sort((a, b) => b.predictedAmount - a.predictedAmount);

  }, [expenses, categories, month]);

  const totalPrediction = useMemo(() => predictions.reduce((sum, p) => sum + p.predictedAmount, 0), [predictions]);
  const totalCurrent = useMemo(() => predictions.reduce((sum, p) => sum + p.currentAmount, 0), [predictions]);

  const getStatusTextAndColor = (status: Prediction['status']) => {
    switch (status) {
      case 'on_track': return { text: '順調です', color: 'bg-green-500' };
      case 'over_spending': return { text: '少し使いすぎです', color: 'bg-yellow-500' };
      case 'at_risk': return { text: '予算オーバーの可能性があります', color: 'bg-red-500' };
    }
  };

  if (loading) return <div className="bg-white p-6 rounded-lg shadow-md text-center">予測を計算中...</div>;
  if (error) return <div className="bg-white p-6 rounded-lg shadow-md text-center text-red-500">{error}</div>;
  if (predictions.length === 0) return null; // Don't render if no predictions can be made

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold text-gray-800 mb-4">今月の支出予測</h3>
      <div className="mb-6 text-center">
        <p className="text-gray-600">現在の合計支出</p>
        <p className="text-2xl font-bold text-gray-800">¥{totalCurrent.toLocaleString()}</p>
        <p className="text-gray-600 mt-2">今月の着地予測</p>
        <p className="text-3xl font-bold text-indigo-600">¥{Math.round(totalPrediction).toLocaleString()}</p>
      </div>
      <div className="space-y-4">
        {predictions.slice(0, 5).map(p => ( // Show top 5 categories
          <div key={p.categoryId}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold">{p.categoryName}</span>
              <span className={`text-sm font-medium ${getStatusTextAndColor(p.status).color.replace('bg', 'text')}`}>
                {getStatusTextAndColor(p.status).text}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className={`h-4 rounded-full ${getStatusTextAndColor(p.status).color}`}
                style={{ width: `${Math.min((p.currentAmount / p.predictedAmount) * 100, 100)}%` }}
              ></div>
            </div>
            <div className="text-right text-sm text-gray-500 mt-1">
              ¥{p.currentAmount.toLocaleString()} / 予測 ¥{Math.round(p.predictedAmount).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpensePredictor;
