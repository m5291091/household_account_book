"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, doc, updateDoc, deleteField } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';
import { format } from 'date-fns';
import Link from 'next/link';

export default function ReceiptsPage() {
  const { user, loading: authLoading } = useAuth();
  const [receipts, setReceipts] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setLoading(false);
      return;
    }

    const expensesQuery = query(collection(db, 'users', user.uid, 'expenses'));
    
    const unsubscribe = onSnapshot(expensesQuery, (snapshot) => {
      const expensesWithReceipts = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Expense))
        .filter(expense => expense.receiptUrl && expense.receiptUrl.trim() !== '')
        .sort((a, b) => b.date.toMillis() - a.date.toMillis());
        
      setReceipts(expensesWithReceipts);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  const handleRemoveReceipt = async (expenseId: string) => {
    if (!user || !confirm('このレシート画像を削除してもよろしいですか？（支出の記録は残ります）')) return;
    
    setRemovingId(expenseId);
    try {
      const expenseRef = doc(db, 'users', user.uid, 'expenses', expenseId);
      await updateDoc(expenseRef, {
        receiptUrl: "" // Firebase Storage上のファイル自体は残りますが、リンクは解除されます
      });
    } catch (error) {
      console.error("Failed to remove receipt link", error);
      alert('レシートの削除に失敗しました。');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center mt-20">
        <p className="text-xl">ログインしてください</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">レシート・領収書一覧</h1>
        <Link 
          href="/transactions/expense" 
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          支出を記録する
        </Link>
      </div>

      {receipts.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-lg shadow">
          <p className="text-gray-500 dark:text-gray-400 text-lg">添付されたレシートはありません。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {receipts.map(expense => (
            <div key={expense.id} className="bg-white dark:bg-black border dark:border-gray-700 rounded-lg shadow-sm overflow-hidden flex flex-col">
              <div className="relative pt-[100%] bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 group">
                <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer">
                  {expense.receiptUrl?.toLowerCase().endsWith('.pdf') ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 hover:text-indigo-600 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="font-semibold">PDFファイル</span>
                    </div>
                  ) : (
                    <img 
                      src={expense.receiptUrl} 
                      alt={`${expense.store || '店舗なし'}のレシート`} 
                      className="absolute inset-0 w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                    />
                  )}
                </a>
              </div>
              
              <div className="p-4 flex-grow flex flex-col justify-between">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {format(expense.date.toDate(), 'yyyy年MM月dd日')}
                  </div>
                  <div className="font-bold text-lg mb-1 dark:text-gray-100">
                    ¥{expense.amount.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {expense.store || '(店名未登録)'}
                  </div>
                  {expense.memo && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                      {expense.memo}
                    </div>
                  )}
                </div>
                
                <div className="mt-4 pt-3 border-t dark:border-gray-700 flex justify-end">
                  <button
                    onClick={() => handleRemoveReceipt(expense.id)}
                    disabled={removingId === expense.id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {removingId === expense.id ? '削除中...' : '添付を解除'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
