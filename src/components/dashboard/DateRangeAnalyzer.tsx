"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentMethod } from '@/types/PaymentMethod';

const DateRangeAnalyzer = () => {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
    getDocs(pmQuery).then(snapshot => {
      setPaymentMethods(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod)));
    });
  }, [user]);

  const handleMethodChange = (methodId: string) => {
    setSelectedMethods(prev => 
      prev.includes(methodId) 
        ? prev.filter(id => id !== methodId)
        : [...prev, methodId]
    );
  };

  const handleAnalyze = async () => {
    if (!user || !startDate || !endDate || selectedMethods.length === 0) {
      setError('開始日、終了日、および少なくとも1つの支払い方法を選択してください。');
      return;
    }
    setError(null);
    setLoading(true);
    setTotal(null);

    try {
      const start = Timestamp.fromDate(new Date(startDate));
      const end = Timestamp.fromDate(new Date(endDate));

      const expensesQuery = query(
        collection(db, 'users', user.uid, 'expenses'),
        where('date', '>=', start),
        where('date', '<=', end),
        where('paymentMethodId', 'in', selectedMethods)
      );

      const querySnapshot = await getDocs(expensesQuery);
      let calculatedTotal = 0;
      querySnapshot.forEach(doc => {
        calculatedTotal += doc.data().amount;
      });
      
      setTotal(calculatedTotal);
    } catch (err) {
      console.error(err);
      setError('集計中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">期間・支払方法別集計</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-200">開始日</label>
            <input type="date" id="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md"/>
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-gray-200">終了日</label>
            <input type="date" id="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md"/>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">支払い方法（複数選択可）</label>
          <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border p-2 rounded-md">
            {paymentMethods.map(method => (
              <div key={method.id} className="flex items-center">
                <input
                  id={`method-${method.id}`}
                  type="checkbox"
                  checked={selectedMethods.includes(method.id)}
                  onChange={() => handleMethodChange(method.id)}
                  className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor={`method-${method.id}`} className="ml-2 block text-sm text-gray-900 dark:text-white">{method.name}</label>
              </div>
            ))}
          </div>
        </div>
        <button onClick={handleAnalyze} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md disabled:bg-indigo-300">
          {loading ? '集計中...' : '集計する'}
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {total !== null && (
          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">合計支出</p>
            <p className="text-2xl font-bold text-indigo-600">¥{total.toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DateRangeAnalyzer;
