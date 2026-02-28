"use client";

import { useState } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { format, eachMonthOfInterval, startOfMonth, endOfMonth, getMonth, getYear } from 'date-fns';
import { Income } from '@/types/Income';
import { Expense } from '@/types/Expense';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface MonthlyRow {
  label: string;
  income: number;
  expense: number;
  savings: number;
}

const SavingsRangeAnalyzer = () => {
  const { user } = useAuth();

  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    totalIncome: number;
    totalExpense: number;
    monthly: MonthlyRow[];
  } | null>(null);

  const handleAnalyze = async () => {
    if (!user || !startDate || !endDate) return;
    if (startDate > endDate) {
      setError('開始日は終了日より前に設定してください。');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const [incomeSnap, expenseSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'users', user.uid, 'incomes'),
          where('date', '>=', Timestamp.fromDate(start)),
          where('date', '<=', Timestamp.fromDate(end))
        )),
        getDocs(query(
          collection(db, 'users', user.uid, 'expenses'),
          where('date', '>=', Timestamp.fromDate(start)),
          where('date', '<=', Timestamp.fromDate(end))
        )),
      ]);

      const incomes = incomeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Income));
      const expenses = expenseSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));

      // Build monthly breakdown
      const months = eachMonthOfInterval({ start: startOfMonth(start), end: startOfMonth(end) });
      const monthlyMap = new Map<string, MonthlyRow>();
      months.forEach(m => {
        const key = format(m, 'yyyy-MM');
        monthlyMap.set(key, { label: format(m, 'yyyy年M月'), income: 0, expense: 0, savings: 0 });
      });

      incomes.forEach(inc => {
        const d = inc.date.toDate();
        const key = `${getYear(d)}-${String(getMonth(d) + 1).padStart(2, '0')}`;
        const row = monthlyMap.get(key);
        if (row) row.income += inc.amount;
      });
      expenses.forEach(exp => {
        const d = exp.date.toDate();
        const key = `${getYear(d)}-${String(getMonth(d) + 1).padStart(2, '0')}`;
        const row = monthlyMap.get(key);
        if (row) row.expense += exp.amount;
      });
      monthlyMap.forEach(row => { row.savings = row.income - row.expense; });

      const monthly = Array.from(monthlyMap.values());
      const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
      const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);

      setResult({ totalIncome, totalExpense, monthly });
    } catch (err) {
      console.error(err);
      setError('データの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const savings = result ? result.totalIncome - result.totalExpense : 0;
  const savingsRate = result && result.totalIncome > 0
    ? ((savings / result.totalIncome) * 100).toFixed(1)
    : null;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">期間別 貯金額の集計</h2>

      {/* Date range inputs */}
      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">開始日</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-black text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">終了日</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-black text-gray-900 dark:text-white"
          />
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-md"
        >
          {loading ? '集計中...' : '集計する'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">合計収入</p>
              <p className="text-xl font-bold text-green-600">¥{result.totalIncome.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">合計支出</p>
              <p className="text-xl font-bold text-red-500">¥{result.totalExpense.toLocaleString()}</p>
            </div>
            <div className={`p-4 rounded-lg text-center ${savings >= 0 ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-orange-50 dark:bg-orange-900/30'}`}>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">貯金額</p>
              <p className={`text-xl font-bold ${savings >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                ¥{savings.toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">貯蓄率</p>
              <p className={`text-xl font-bold ${savingsRate !== null && parseFloat(savingsRate) >= 0 ? 'text-purple-600' : 'text-orange-600'}`}>
                {savingsRate !== null ? `${savingsRate}%` : '—'}
              </p>
            </div>
          </div>

          {/* Monthly bar chart */}
          {result.monthly.length > 1 && (
            <div>
              <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-3">月別内訳</h3>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={result.monthly} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`} />
                    <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="income" name="収入" fill="#22c55e" />
                    <Bar dataKey="expense" name="支出" fill="#ef4444" />
                    <Bar dataKey="savings" name="貯金" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Monthly table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">月</th>
                  <th className="text-right px-3 py-2 font-semibold text-green-600">収入</th>
                  <th className="text-right px-3 py-2 font-semibold text-red-500">支出</th>
                  <th className="text-right px-3 py-2 font-semibold text-blue-600">貯金</th>
                  <th className="text-right px-3 py-2 font-semibold text-purple-600">貯蓄率</th>
                </tr>
              </thead>
              <tbody>
                {result.monthly.map((row, i) => {
                  const rate = row.income > 0 ? ((row.savings / row.income) * 100).toFixed(1) : '—';
                  return (
                    <tr key={i} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900">
                      <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{row.label}</td>
                      <td className="px-3 py-2 text-right text-green-600">¥{row.income.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-red-500">¥{row.expense.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${row.savings >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        ¥{row.savings.toLocaleString()}
                      </td>
                      <td className={`px-3 py-2 text-right ${row.income > 0 && row.savings / row.income >= 0 ? 'text-purple-600' : 'text-orange-600'}`}>
                        {rate}{rate !== '—' ? '%' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-800 font-bold">
                  <td className="px-3 py-2 text-gray-800 dark:text-gray-200">合計</td>
                  <td className="px-3 py-2 text-right text-green-600">¥{result.totalIncome.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-red-500">¥{result.totalExpense.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right ${savings >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>¥{savings.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right ${savingsRate !== null && parseFloat(savingsRate) >= 0 ? 'text-purple-600' : 'text-orange-600'}`}>
                    {savingsRate !== null ? `${savingsRate}%` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default SavingsRangeAnalyzer;
