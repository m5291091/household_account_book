// /src/app/yearly-report/page.tsx
"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { startOfYear, endOfYear, getMonth } from 'date-fns';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Expense } from '@/types/Expense';
import { Income } from '@/types/Income';
import { PaymentMethod } from '@/types/PaymentMethod';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff4d4d', '#4dff4d', '#4d4dff', '#ff8c00', '#9932cc', '#20b2aa', '#d2691e'];

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;
  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const YearlyReportPage = () => {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<Map<string, string>>(new Map());
  const [incomeCategories, setIncomeCategories] = useState<Map<string, string>>(new Map());
  const [paymentMethods, setPaymentMethods] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user) return;

    const fetchAuxiliaryData = async () => {
      // Fetch expense categories
      const catQuery = query(collection(db, 'users', user.uid, 'categories'));
      const catSnapshot = await getDocs(catQuery);
      const catMap = new Map<string, string>();
      catSnapshot.forEach(doc => catMap.set(doc.id, doc.data().name));
      setExpenseCategories(catMap);

      // Fetch payment methods
      const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
      const pmSnapshot = await getDocs(pmQuery);
      const pmMap = new Map<string, string>();
      pmSnapshot.forEach(doc => pmMap.set(doc.id, doc.data().name));
      setPaymentMethods(pmMap);
    };

    fetchAuxiliaryData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(selectedYear, 11, 31));

    const fetchData = async () => {
      try {
        // Fetch expenses
        const expensesQuery = query(
          collection(db, 'users', user.uid, 'expenses'),
          where('date', '>=', Timestamp.fromDate(yearStart)),
          where('date', '<=', Timestamp.fromDate(yearEnd))
        );
        const expenseSnapshot = await getDocs(expensesQuery);
        const expensesData = expenseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
        setExpenses(expensesData);

        // Fetch incomes
        const incomesQuery = query(
          collection(db, 'users', user.uid, 'incomes'),
          where('date', '>=', Timestamp.fromDate(yearStart)),
          where('date', '<=', Timestamp.fromDate(yearEnd))
        );
        const incomeSnapshot = await getDocs(incomesQuery);
        const incomesData = incomeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Income));
        setIncomes(incomesData);

      } catch (err) {
        console.error(err);
        setError('データの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, selectedYear]);

  // --- Data Processing with useMemo ---

  const totalYearlyExpense = useMemo(() => expenses.reduce((sum, exp) => sum + exp.amount, 0), [expenses]);
  const totalYearlyIncome = useMemo(() => incomes.reduce((sum, inc) => sum + inc.amount, 0), [incomes]);

  const monthlyData = useMemo(() => {
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const data = monthNames.map(name => ({ name, "支出": 0, "収入": 0 }));

    expenses.forEach(exp => {
      const month = getMonth(exp.date.toDate());
      data[month]["支出"] += exp.amount;
    });
    incomes.forEach(inc => {
      const month = getMonth(inc.date.toDate());
      data[month]["収入"] += inc.amount;
    });
    return data;
  }, [expenses, incomes]);

  const expenseByCategory = useMemo(() => {
    const dataMap = new Map<string, number>();
    expenses.forEach(exp => {
      const name = expenseCategories.get(exp.categoryId) || '未分類';
      dataMap.set(name, (dataMap.get(name) || 0) + exp.amount);
    });
    return Array.from(dataMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [expenses, expenseCategories]);

  const incomeByCategory = useMemo(() => {
    const dataMap = new Map<string, number>();
    incomes.forEach(inc => {
      const name = inc.category || '未分類';
      dataMap.set(name, (dataMap.get(name) || 0) + inc.amount);
    });
    return Array.from(dataMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [incomes]);

  const expenseByStore = useMemo(() => {
    const dataMap = new Map<string, number>();
    expenses.forEach(exp => {
      const name = exp.store || '店名なし';
      dataMap.set(name, (dataMap.get(name) || 0) + exp.amount);
    });
    return Array.from(dataMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const expenseByPaymentMethod = useMemo(() => {
    const dataMap = new Map<string, number>();
    expenses.forEach(exp => {
      const name = paymentMethods.get(exp.paymentMethodId) || '不明';
      dataMap.set(name, (dataMap.get(name) || 0) + exp.amount);
    });
    return Array.from(dataMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [expenses, paymentMethods]);


  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  if (loading) {
    return <div className="text-center p-10">年間レポートを生成しています...</div>;
  }
  if (error) {
    return <div className="text-center p-10 text-red-500">{error}</div>;
  }

  const renderPieChart = (title: string, data: { name: string, value: number }[]) => (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800">{title}</h3>
      <div style={{ width: '100%', height: 400 }}>
        {data.length > 0 ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={150}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-gray-500 h-full flex items-center justify-center">データがありません。</p>}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-4 md:p-8 bg-gray-50">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800">年間レポート</h1>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="p-2 border rounded-md shadow-sm"
        >
          {yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
        </select>
      </div>

      {/* --- Summary --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <h2 className="text-lg font-semibold text-gray-600">年間合計支出</h2>
          <p className="text-3xl font-bold text-red-500">¥{totalYearlyExpense.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <h2 className="text-lg font-semibold text-gray-600">年間合計収入</h2>
          <p className="text-3xl font-bold text-green-500">¥{totalYearlyIncome.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <h2 className="text-lg font-semibold text-gray-600">年間収支</h2>
          <p className={`text-3xl font-bold ${totalYearlyIncome - totalYearlyExpense >= 0 ? 'text-blue-500' : 'text-red-600'}`}>
            ¥{(totalYearlyIncome - totalYearlyExpense).toLocaleString()}
          </p>
        </div>
      </div>

      {/* --- Monthly Comparison --- */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">月別収支の推移</h2>
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `¥${(value as number / 10000).toLocaleString()}万`} />
              <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
              <Legend />
              <Line type="monotone" dataKey="支出" stroke="#ef4444" strokeWidth={2} activeDot={{ r: 8 }} />
              <Line type="monotone" dataKey="収入" stroke="#22c55e" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- Pie Chart Grid --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {renderPieChart('カテゴリー別年間合計支出', expenseByCategory)}
        {renderPieChart('収入のカテゴリー別年間合計', incomeByCategory)}
        {renderPieChart('支払い方法別年間支出', expenseByPaymentMethod)}
        {renderPieChart('店名・サービスでの年間合計支出', expenseByStore)}
      </div>
    </div>
  );
};

export default YearlyReportPage;
