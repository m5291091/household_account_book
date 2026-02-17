"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ExpenseList from '@/components/expenses/ExpenseList';
import RegularPaymentProcessor from '@/components/expenses/RegularPaymentProcessor';

const CalendarPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());

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
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold mb-8 text-gray-900">カレンダー・履歴</h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              {/* Calendar placeholder or component */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4">カレンダー</h2>
                <p className="text-gray-500">カレンダー表示機能は現在開発中です。</p>
              </div>
              <RegularPaymentProcessor month={currentMonth} />
            </div>
            
            <div className="space-y-8">
              <ExpenseList 
                month={currentMonth} 
                onEditExpense={() => {}}
                onCopyExpense={(data) => {
                  console.log('Copy feature to be implemented', data);
                  alert("コピー機能は現在調整中です。");
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CalendarPage;
