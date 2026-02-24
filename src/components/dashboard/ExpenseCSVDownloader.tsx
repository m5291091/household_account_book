"use client";

import { useState } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { format } from 'date-fns';

const ExpenseCSVDownloader = () => {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!user) {
      setError('ログインしていません。');
      return;
    }
    if (!startDate || !endDate) {
      setError('開始日と終了日を選択してください。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch auxiliary data (Category and Payment Method names)
      const catQuery = query(collection(db, 'users', user.uid, 'categories'));
      const catSnapshot = await getDocs(catQuery);
      const categoryMap = new Map(catSnapshot.docs.map(doc => [doc.id, doc.data().name]));

      const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
      const pmSnapshot = await getDocs(pmQuery);
      const paymentMethodMap = new Map(pmSnapshot.docs.map(doc => [doc.id, doc.data().name]));

      // 2. Fetch expenses within the date range
      const expensesQuery = query(
        collection(db, 'users', user.uid, 'expenses'),
        where('date', '>=', Timestamp.fromDate(new Date(startDate))),
        where('date', '<=', Timestamp.fromDate(new Date(endDate)))
      );
      const expenseSnapshot = await getDocs(expensesQuery);
      const expenses = expenseSnapshot.docs.map(doc => doc.data() as Expense);

      if (expenses.length === 0) {
        alert('指定された期間にデータはありません。');
        setLoading(false);
        return;
      }

      // 3. Generate CSV string
      const headers = ['日付', '金額', 'カテゴリー', '支払い方法', '店名・サービス名', 'メモ'];
      const csvRows = [headers.join(',')];

      expenses.sort((a, b) => a.date.toMillis() - b.date.toMillis());

      for (const expense of expenses) {
        const row = [
          format(expense.date.toDate(), 'yyyy-MM-dd'),
          expense.amount,
          categoryMap.get(expense.categoryId) || '未分類',
          paymentMethodMap.get(expense.paymentMethodId) || '不明',
          `"${expense.store?.replace(/"/g, '""') || ''}"`, // Escape double quotes
          `"${expense.memo?.replace(/"/g, '""') || ''}"`
        ];
        csvRows.push(row.join(','));
      }

      const csvString = csvRows.join('\n');

      // 4. Trigger download
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // BOM for UTF-8
      const blob = new Blob([bom, csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `支出履歴_${startDate}_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error(err);
      setError('CSVファイルの生成に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">支出履歴をダウンロード</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">開始日</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">終了日</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md" />
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="w-full px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:bg-green-300"
      >
        {loading ? '生成中...' : 'CSV形式でダウンロード'}
      </button>
      {error && <p className="text-red-500 text-center mt-4">{error}</p>}
    </div>
  );
};

export default ExpenseCSVDownloader;
