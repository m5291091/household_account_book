// /src/components/dashboard/ExpensePredictor.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { Category } from '@/types/Category';
import { startOfMonth, endOfMonth, subMonths, getMonth, getDate, getDaysInMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface Prediction {
  categoryName: string;
  predictedAmount: number;
  currentAmount: number;
}

const ExpensePredictor = ({ month }: { month: Date }) => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisPeriod, setAnalysisPeriod] = useState<number>(12); // Default: 12 months

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // Fetch last X months of expenses based on analysisPeriod
    const startDate = startOfMonth(subMonths(month, analysisPeriod));
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
  }, [user, month, analysisPeriod]);

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
    const previousMonths = Array.from({ length: analysisPeriod }, (_, i) => getMonth(subMonths(month, i + 1)));

    const predictionsData: Prediction[] = [];

    categories.forEach((categoryName, categoryId) => {
      // Calculate average of the selected period
      let totalOfPeriod = 0;
      let monthsWithData = 0;
      previousMonths.forEach(mIndex => {
        if (monthlyCategoryTotals.has(mIndex) && monthlyCategoryTotals.get(mIndex)!.has(categoryId)) {
          totalOfPeriod += monthlyCategoryTotals.get(mIndex)!.get(categoryId)!;
          monthsWithData++;
        }
      });
      
      if (monthsWithData === 0) return;

      const predictedAmount = Math.round(totalOfPeriod / monthsWithData);
      const currentAmount = monthlyCategoryTotals.get(currentMonthIndex)?.get(categoryId) || 0;

      if (currentAmount > 0 || predictedAmount > 0) {
        predictionsData.push({ categoryName, predictedAmount, currentAmount });
      }
    });
    
    return predictionsData.sort((a, b) => b.predictedAmount - a.predictedAmount);

  }, [expenses, categories, month, analysisPeriod]);

  const totalPrediction = useMemo(() => predictions.reduce((sum, p) => sum + p.predictedAmount, 0), [predictions]);
  const totalCurrent = useMemo(() => predictions.reduce((sum, p) => sum + p.currentAmount, 0), [predictions]);

  if (loading) return <div className="bg-white p-6 rounded-lg shadow-md text-center">予測を計算中...</div>;
  if (error) return <div className="bg-white p-6 rounded-lg shadow-md text-center text-red-500">{error}</div>;
  if (predictions.length === 0 && !loading) return (
    <div className="bg-white p-6 rounded-lg shadow-md">
       <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">今月の支出予測</h3>
        <select
          value={analysisPeriod}
          onChange={(e) => setAnalysisPeriod(Number(e.target.value))}
          className="p-1 border rounded-md text-sm bg-gray-50"
        >
          <option value={3}>過去3ヶ月平均</option>
          <option value={6}>過去6ヶ月平均</option>
          <option value={12}>過去12ヶ月平均</option>
        </select>
      </div>
      <p className="text-center text-gray-500 py-10">予測を計算するための十分な過去のデータがありません。</p>
    </div>
  );

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">今月の支出予測</h3>
        <select
          value={analysisPeriod}
          onChange={(e) => setAnalysisPeriod(Number(e.target.value))}
          className="p-1 border rounded-md text-sm bg-gray-50"
        >
          <option value={3}>過去3ヶ月平均</option>
          <option value={6}>過去6ヶ月平均</option>
          <option value={12}>過去12ヶ月平均</option>
        </select>
      </div>
      <div className="mb-6 grid grid-cols-2 text-center">
        <div>
          <p className="text-gray-600">現在の合計</p>
          <p className="text-2xl font-bold text-gray-800">¥{totalCurrent.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-gray-600">着地予測</p>
          <p className="text-2xl font-bold text-indigo-600">¥{totalPrediction.toLocaleString()}</p>
        </div>
      </div>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <BarChart
            layout="vertical"
            data={predictions.slice(0, 5)}
            margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="categoryName" width={80} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="currentAmount" name="現在" fill="#8884d8" />
            <Bar dataKey="predictedAmount" name="予測" fill="#82ca9d" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ExpensePredictor;
