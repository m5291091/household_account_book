
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, getDocs, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Expense } from '@/types/Expense';

const ExpenseAnalyzer = () => {
  const { user } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  
  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');

  // Result states
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
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
    setTotalAmount(null);

    try {
      // 1. Fetch data based on date range from Firestore
      const expensesQuery = query(
        collection(db, 'users', user.uid, 'expenses'),
        where('date', '>=', Timestamp.fromDate(new Date(startDate))),
        where('date', '<=', Timestamp.fromDate(new Date(endDate)))
      );
      
      const querySnapshot = await getDocs(expensesQuery);
      const expenses = querySnapshot.docs.map(doc => doc.data() as Expense);

      // 2. Client-side filtering
      const filteredExpenses = expenses.filter(expense => {
        // Payment method filter
        const paymentMethodMatch = selectedPaymentMethods.length === 0 || selectedPaymentMethods.includes(expense.paymentMethodId);
        
        // Search text filter
        const searchLower = searchText.toLowerCase();
        const textMatch = searchText === '' ||
          expense.store?.toLowerCase().includes(searchLower) ||
          expense.memo?.toLowerCase().includes(searchLower);
          
        return paymentMethodMatch && textMatch;
      });

      // 3. Calculate total
      const total = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      setTotalAmount(total);

    } catch (err) {
      console.error(err);
      setError('データの分析中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

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
          {loading ? '分析中...' : '合計を計算'}
        </button>
      </div>

      {/* Results */}
      {error && <p className="text-red-500 text-center">{error}</p>}
      {totalAmount !== null && (
        <div className="text-center bg-gray-50 p-4 rounded-lg">
          <p className="text-lg text-gray-600">選択された条件での合計支出</p>
          <p className="text-3xl font-bold text-indigo-600">¥{totalAmount.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
};

export default ExpenseAnalyzer;
