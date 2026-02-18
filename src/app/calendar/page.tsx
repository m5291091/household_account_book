"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ExpenseList from '@/components/expenses/ExpenseList';
import RegularPaymentProcessor from '@/components/expenses/RegularPaymentProcessor';
import { format, addMonths, subMonths } from 'date-fns';
import CalendarViewSettings from '@/components/calendar/CalendarViewSettings';

const CalendarPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'monthly_grid'>('calendar');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <div className="flex h-full items-center justify-center"><p>読み込み中...</p></div>;
  }

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">カレンダー</h1>
          </div>

          {/* Month Navigation */}
          <div className="flex justify-between items-center mb-8 bg-white dark:bg-black p-4 rounded-lg shadow-md">
            <button onClick={goToPreviousMonth} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 font-bold py-2 px-4 rounded">
              &lt; 前月
            </button>
            <h2 className="text-2xl font-bold">{format(currentMonth, 'yyyy年 M月')}</h2>
            <button onClick={goToNextMonth} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 font-bold py-2 px-4 rounded">
              次月 &gt;
            </button>
          </div>
          
          <div className="space-y-8">
            <RegularPaymentProcessor month={currentMonth} />
            
            <ExpenseList 
              month={currentMonth} 
              onEditExpense={() => {}}
              onCopyExpense={(data) => {
                console.log('Copy feature to be implemented', data);
                alert("コピー機能は現在調整中です。");
              }}
              viewMode={viewMode}
              headerAction={<CalendarViewSettings onViewModeChange={setViewMode} currentViewMode={viewMode} />}
            />
            
            <ExpenseList 
              month={subMonths(currentMonth, 1)}
              title="先月の支出履歴"
              onEditExpense={() => {}}
              onCopyExpense={() => {}}
              viewMode={viewMode}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default CalendarPage;
