
"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, getDocs, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Expense } from '@/types/Expense';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

// Colors for the pie chart
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff4d4d', '#4dff4d', '#4d4dff'];

const ExpenseAnalyzer = () => {
  const { user } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  
  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');

  // Result states
  const [analysisResult, setAnalysisResult] = useState<{ name: string; value: number }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch payment methods for the checklist
  useEffect(() => {
    if (!user) return;
    const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
    const unsubscribe = onSnapshot(pmQuery, (snapshot) => {
      const pms = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod));
      setPaymentMethods(pms);
    });
    return () => unsubscribe();
  }, [user]);

  const handlePaymentMethodChange = (pmId: string) => {
    setSelectedPaymentMethods(prev =>
      prev.includes(pmId) ? prev.filter(id => id !== pmId) : [...prev, pmId]
    );
  };

  const handleAnalyze = async () => {
    if (!user || !startDate || !endDate) {
      setError('開始日と終了日を選択してください。');
      return;
    }
    setLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const expensesQuery = query(
        collection(db, 'users', user.uid, 'expenses'),
        where('date', '>=', Timestamp.fromDate(new Date(startDate))),
        where('date', '<=', Timestamp.fromDate(new Date(endDate)))
      );
      
      const querySnapshot = await getDocs(expensesQuery);
      const expenses = querySnapshot.docs.map(doc => doc.data() as Expense);

      const filteredExpenses = expenses.filter(expense => {
        const paymentMethodMatch = selectedPaymentMethods.length === 0 || selectedPaymentMethods.includes(expense.paymentMethodId);
        const searchLower = searchText.toLowerCase();
        const textMatch = searchText === '' ||
          expense.store?.toLowerCase().includes(searchLower) ||
          expense.memo?.toLowerCase().includes(searchLower);
        return paymentMethodMatch && textMatch;
      });

      // Aggregate by store
      const byStore = filteredExpenses.reduce((acc, expense) => {
        const storeName = expense.store || '(不明)';
        if (!acc[storeName]) {
          acc[storeName] = 0;
        }
        acc[storeName] += expense.amount;
        return acc;
      }, {} as { [key: string]: number });

      const result = Object.entries(byStore)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value); // Sort by amount descending

      setAnalysisResult(result);

    } catch (err) {
      console.error(err);
      setError('データの分析中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  // Calculate total amount from analysisResult
  const totalAmount = useMemo(() => {
    if (!analysisResult) return null;
    return analysisResult.reduce((sum, item) => sum + item.value, 0);
  }, [analysisResult]);

  // Prepare data for BarChart (reversed for vertical layout)
  const barChartData = useMemo(() => {
    if (!analysisResult) return [];
    return [...analysisResult].reverse();
  }, [analysisResult]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">支出分析</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700">期間</label>
          <div className="flex items-center space-x-2 mt-1">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" />
            <span>〜</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" />
          </div>
        </div>

        {/* Search Text */}
        <div>
          <label htmlFor="searchText" className="block text-sm font-medium text-gray-700">店名・メモ</label>
          <input
            id="searchText"
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="キーワードで検索..."
            className="mt-1 w-full p-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>

      {/* Payment Methods */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700">支払方法（未選択の場合はすべて）</label>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          {paymentMethods.map(pm => (
            <label key={pm.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedPaymentMethods.includes(pm.id)}
                onChange={() => handlePaymentMethodChange(pm.id)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span>{pm.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-center mb-4">
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {loading ? '分析中...' : '分析実行'}
        </button>
      </div>

      {/* Results */}
      {error && <p className="text-red-500 text-center">{error}</p>}
      
      {analysisResult && (
        <div className="mt-8">
          {totalAmount !== null && totalAmount > 0 ? (
            <>
              <div className="text-center bg-gray-50 p-4 rounded-lg mb-8">
                <p className="text-lg text-gray-600">選択された条件での合計支出</p>
                <p className="text-3xl font-bold text-indigo-600">¥{totalAmount.toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Bar Chart */}
                <div className="w-full">
                  <h3 className="text-xl font-semibold text-gray-700 mb-4">店舗・サービス別支出（横棒グラフ）</h3>
                  <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                      <BarChart
                        layout="vertical"
                        data={barChartData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={80} />
                        <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                        <Legend />
                        <Bar dataKey="value" name="支出額" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie Chart */}
                <div className="w-full">
                  <h3 className="text-xl font-semibold text-gray-700 mb-4">店舗・サービス別支出（円グラフ）</h3>
                  <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={analysisResult}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={120}
                          fill="#8884d8"
                          label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                          labelLine={false}
                        >
                          {analysisResult.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">分析結果がありません。</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExpenseAnalyzer;
