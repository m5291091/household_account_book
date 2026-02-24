"use client";

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useExpensePrediction } from '@/hooks/useExpensePrediction';

const ExpensePredictor = () => {
  const { user } = useAuth();
  const [historyMonths, setHistoryMonths] = useState<number>(6);
  const { chartData, prediction, trend, loading, error } = useExpensePrediction(historyMonths);

  if (loading) return <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">分析中...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">AI支出予測（単回帰分析）</h2>
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
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">来月の予想支出</p>
          <p className="text-3xl font-bold text-indigo-600">¥{prediction.toLocaleString()}</p>
        </div>
        <div className={`p-4 rounded-lg text-center ${
          trend === 'increasing' ? 'bg-red-50 text-red-600' : 
          trend === 'decreasing' ? 'bg-green-50 text-green-600' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300'
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
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
        ※ 過去の支出データに基づき、線形回帰モデルを用いて来月の支出を統計的に予測しています。
      </p>
    </div>
  );
};

export default ExpensePredictor;
