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
import MonthlyDataTable from '@/components/dashboard/MonthlyDataTable';
import DashboardFilterBar from '@/components/dashboard/DashboardFilterBar';

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

  // Filter state (same as dashboard)
  const [showTransfers, setShowTransfers] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string[]>([]);

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

  // Apply filter: transfers and payment method
  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (!showTransfers) result = result.filter(exp => !exp.isTransfer);
    if (paymentMethodFilter.length > 0) result = result.filter(exp => paymentMethodFilter.includes(exp.paymentMethodId));
    return result;
  }, [expenses, showTransfers, paymentMethodFilter]);

  const totalYearlyExpense = useMemo(() => filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0), [filteredExpenses]);
  const totalYearlyNetIncome = useMemo(() => incomes.reduce((sum, inc) => sum + inc.amount, 0), [incomes]);
  const totalYearlyTax = useMemo(() => incomes.reduce((sum, inc) => sum + (inc.totalTaxableAmount || 0), 0), [incomes]);

  const monthlyData = useMemo(() => {
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const data = monthNames.map(name => ({ name, "支出": 0, "差引支給額": 0 }));

    filteredExpenses.forEach(exp => {
      const month = getMonth(exp.date.toDate());
      data[month]["支出"] += exp.amount;
    });
    incomes.forEach(inc => {
      const month = getMonth(inc.date.toDate());
      data[month]["差引支給額"] += inc.amount;
    });
    return data;
  }, [filteredExpenses, incomes]);

  const monthlyIncomeByCategoryData = useMemo(() => {
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const categoryMap = new Map<string, { name: string; "差引支給額": number; "課税合計": number; }[]>();

    incomes.forEach(inc => {
      const category = inc.category || '未分類';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, monthNames.map(name => ({ name, "差引支給額": 0, "課税合計": 0 })));
      }
      
      const monthData = categoryMap.get(category)!;
      const monthIndex = getMonth(inc.date.toDate());
      monthData[monthIndex]["差引支給額"] += inc.amount;
      monthData[monthIndex]["課税合計"] += inc.totalTaxableAmount || 0;
    });

    return Array.from(categoryMap.entries());
  }, [incomes]);

  const expenseByCategory = useMemo(() => {
    const dataMap = new Map<string, number>();
    filteredExpenses.forEach(exp => {
      const name = expenseCategories.get(exp.categoryId) || '未分類';
      dataMap.set(name, (dataMap.get(name) || 0) + exp.amount);
    });
    return Array.from(dataMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [filteredExpenses, expenseCategories]);

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
    filteredExpenses.forEach(exp => {
      const name = exp.store || '店名なし';
      dataMap.set(name, (dataMap.get(name) || 0) + exp.amount);
    });
    return Array.from(dataMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const expenseByPaymentMethod = useMemo(() => {
    const dataMap = new Map<string, number>();
    filteredExpenses.forEach(exp => {
      const name = paymentMethods.get(exp.paymentMethodId) || '不明';
      dataMap.set(name, (dataMap.get(name) || 0) + exp.amount);
    });
    return Array.from(dataMap.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [filteredExpenses, paymentMethods]);


  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  if (loading) {
    return <div className="text-center p-10">年間レポートを生成しています...</div>;
  }
  if (error) {
    return <div className="text-center p-10 text-red-500">{error}</div>;
  }

  const renderPieChart = (title: string, data: { name: string, value: number }[]) => (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">{title}</h3>
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
        ) : <p className="text-center text-gray-500 dark:text-gray-400 h-full flex items-center justify-center">データがありません。</p>}
      </div>
    </div>
  );

  const renderBarChart = (title: string, data: { name: string, value: number }[]) => {
    // Calculate height based on the number of items to ensure readability
    // Minimum height 400px, add 40px per item
    const height = Math.max(400, data.length * 40);

    return (
      <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md overflow-hidden">
        <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">{title}</h3>
        <div style={{ width: '100%', height: height, overflowX: 'auto' }}>
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => `¥${value.toLocaleString()}`} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="value" name="支出" fill="#8884d8" barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 h-full flex items-center justify-center">
              データがありません。
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="container mx-auto p-4 md:p-8">
          <div className="flex justify-end items-center mb-8">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="p-2 border rounded-md shadow-sm"
            >
              {yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
            </select>
          </div>

          {/* --- Summary --- */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-8">
            <div className="bg-white dark:bg-black p-4 md:p-6 rounded-lg shadow-md text-center">
              <h2 className="text-sm md:text-lg font-semibold text-gray-600 dark:text-gray-300">年間合計支出</h2>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-red-500 break-words">¥{totalYearlyExpense.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-black p-4 md:p-6 rounded-lg shadow-md text-center">
              <h2 className="text-sm md:text-lg font-semibold text-gray-600 dark:text-gray-300">年間合計 差引支給額</h2>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500 break-words">¥{totalYearlyNetIncome.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-black p-4 md:p-6 rounded-lg shadow-md text-center">
              <h2 className="text-sm md:text-lg font-semibold text-gray-600 dark:text-gray-300">年間累積 課税合計</h2>
              <p className="text-xl sm:text-2xl md:text-3xl font-bold text-yellow-600 break-words">¥{totalYearlyTax.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-black p-4 md:p-6 rounded-lg shadow-md text-center">
              <h2 className="text-sm md:text-lg font-semibold text-gray-600 dark:text-gray-300">年間収支</h2>
              <p className={`text-xl sm:text-2xl md:text-3xl font-bold break-words ${totalYearlyNetIncome - totalYearlyExpense >= 0 ? 'text-blue-500' : 'text-red-600'}`}>
                ¥{(totalYearlyNetIncome - totalYearlyExpense).toLocaleString()}
              </p>
            </div>
          </div>

          {/* --- Monthly Comparison --- */}
          <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">月別収支の推移</h2>
            <div style={{ width: '100%', height: 400 }}>
              <ResponsiveContainer>
                <LineChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => `¥${(value as number / 10000).toLocaleString()}万`} />
                  <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                  <Legend />
                  <Line type="monotone" dataKey="支出" stroke="#ef4444" strokeWidth={2} activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="差引支給額" stroke="#22c55e" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <MonthlyDataTable
              title="月別収支データ"
              data={monthlyData}
              columns={[
                { key: 'name', label: '月' },
                { key: '支出', label: '支出 (円)' },
                { key: '差引支給額', label: '差引支給額 (円)' },
              ]}
              fileName={`${selectedYear}年_月別収支`}
            />
          </div>
          
          {/* --- Monthly Income Breakdown --- */}
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-12 border-b pb-2">月別収入内訳の推移</h2>
            {monthlyIncomeByCategoryData.map(([category, data]) => (
              <div key={category} className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
                <h3 className="text-2xl font-bold mb-4 text-gray-700 dark:text-gray-200">{category}</h3>
                <div style={{ width: '100%', height: 400 }}>
                  <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(value) => `¥${(value as number / 10000).toLocaleString()}万`} />
                      <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                      <Legend />
                      <Line type="monotone" dataKey="差引支給額" stroke="#22c55e" strokeWidth={2} />
                      <Line type="monotone" dataKey="課税合計" stroke="#f59e0b" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <MonthlyDataTable
                  title={`${category} - データ詳細`}
                  data={data}
                  columns={[
                    { key: 'name', label: '月' },
                    { key: '差引支給額', label: '差引支給額 (円)' },
                    { key: '課税合計', label: '課税合計 (円)' },
                  ]}
                  fileName={`${selectedYear}年_${category}_月別収入内訳`}
                />
              </div>
            ))}
          </div>

          {/* --- Pie Chart Grid --- */}
          <div className="mt-12">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 border-b pb-2 mb-4">年間サマリー</h2>

            {/* Filter bar — same as dashboard */}
            <div className="mb-6">
              <DashboardFilterBar
                showTransfers={showTransfers}
                onShowTransfersChange={setShowTransfers}
                paymentMethodFilter={paymentMethodFilter}
                onPaymentMethodFilterChange={setPaymentMethodFilter}
              />
              {(paymentMethodFilter.length > 0 || !showTransfers) && (
                <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2 pl-1">
                  ※ 絞り込み中：このページの全グラフに適用されています
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {renderPieChart('カテゴリー別年間合計支出', expenseByCategory)}
              {renderPieChart('収入のカテゴリー別年間合計', incomeByCategory)}
              {renderPieChart('支払い方法別年間支出', expenseByPaymentMethod)}
              {renderBarChart('店名・サービスでの年間合計支出', expenseByStore)}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default YearlyReportPage;
