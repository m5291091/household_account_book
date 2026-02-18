"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import IncomeForm from '@/components/income/IncomeForm';
import { Income } from '@/types/Income';
import Link from 'next/link';

const EditIncomePage = () => {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const [income, setIncome] = useState<Income | null>(null);
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

    const fetchIncome = async () => {
      try {
        const incomeRef = doc(db, 'users', user.uid, 'incomes', id);
        const docSnap = await getDoc(incomeRef);

        if (docSnap.exists()) {
          setIncome({ id: docSnap.id, ...docSnap.data() } as Income);
        } else {
          setError('収入データが見つかりませんでした。');
        }
      } catch (err) {
        console.error(err);
        setError('データの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchIncome();
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
            収入を編集
          </h1>
          <Link href="/dashboard" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:text-white">
              &lt; ダッシュボードに戻る
          </Link>
        </div>
      </header>
      <main className="py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {income ? (
                <IncomeForm incomeToEdit={income} onFormClose={handleFormClose} />
            ) : (
                <p>編集するデータが見つかりません。</p>
            )}
        </div>
      </main>
    </div>
  );
};

export default EditIncomePage;
