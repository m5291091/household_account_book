"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Header from '@/components/layout/Header';

const CalendarPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="flex h-full items-center justify-center"><p>読み込み中...</p></div>;
  }

  return (
    <div className="">
      <Header />
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold mb-4">カレンダー</h1>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <p>カレンダー機能は現在開発中です。</p>
            {/* Future implementation: Integrate a calendar library or custom calendar view */}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CalendarPage;
