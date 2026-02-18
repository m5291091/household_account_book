"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import { Expense } from '@/types/Expense';
import Link from 'next/link';

const EditExpensePage = () => {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const id = typeof params.id === 'string' ? params.id : '';

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }
    if (!id) {
        setError("IDが見つかりません。");
        setLoading(false);
        return;
    }

    const fetchExpense = async () => {
      try {
        const expenseRef = doc(db, 'users', user.uid, 'expenses', id);
        const docSnap = await getDoc(expenseRef);

        if (docSnap.exists()) {
          setExpense({ id: docSnap.id, ...docSnap.data() } as Expense);
        } else {
          setError('支出データが見つかりませんでした。');
        }
      } catch (err) {
        console.error(err);
        setError('データの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchExpense();
  }, [id, user, authLoading, router]);

  const handleFormClose = () => {
    router.push('/dashboard');
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><p>読み込み中...</p></div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-red-500">{error}</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
       <header className="bg-white dark:bg-black shadow-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            支出を編集
          </h1>
          <Link href="/dashboard" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:text-white">
              &lt; ダッシュボードに戻る
          </Link>
        </div>
      </header>
      <main className="py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {expense ? (
                <ExpenseForm expenseToEdit={expense} onFormClose={handleFormClose} />
            ) : (
                <p>編集するデータが見つかりません。</p>
            )}
        </div>
      </main>
    </div>
  );
};

export default EditExpensePage;
