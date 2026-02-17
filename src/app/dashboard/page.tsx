"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LogoutButton from '@/components/auth/LogoutButton';
import Link from 'next/link';
import DashboardSummary from '@/components/dashboard/DashboardSummary';
import IncomeExpenseChart from '@/components/dashboard/IncomeExpenseChart';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import PaymentMethodChart from '@/components/dashboard/PaymentMethodChart';
import BudgetStatus from '@/components/dashboard/BudgetStatus';
import ExpenseAnalyzer from '@/components/dashboard/ExpenseAnalyzer';
import { format, addMonths, subMonths } from 'date-fns';
import IncomeCategoryChart from '@/components/dashboard/IncomeCategoryChart';
import StoreChart from '@/components/dashboard/StoreChart';
import ExpensePredictor from '@/components/dashboard/ExpensePredictor';
import ExpenseCSVDownloader from '@/components/dashboard/ExpenseCSVDownloader';

const DashboardPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl">読み込み中...</p>
      </div>
    );
  }

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  return (
    <div className="">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            ダッシュボード
          </h1>
          <nav className="flex items-center space-x-4">
            <Link href="/transactions" className="text-gray-600 hover:text-gray-900">
              記録・編集
            </Link>
            <Link href="/yearly-report" className="text-gray-600 hover:text-gray-900">
              年間レポート
            </Link>
            <Link href="/settings" className="text-gray-600 hover:text-gray-900">
              設定
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Month Navigation */}
          <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow-md">
            <button onClick={goToPreviousMonth} className="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">
              &lt; 前月
            </button>
            <h2 className="text-2xl font-bold">{format(currentMonth, 'yyyy年 M月')}</h2>
            <button onClick={goToNextMonth} className="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">
              次月 &gt;
            </button>
          </div>

          <div className="space-y-8">
            <DashboardSummary month={currentMonth} />
            <ExpensePredictor month={currentMonth} />
            <IncomeExpenseChart month={currentMonth} />
            <IncomeCategoryChart month={currentMonth} />
            <BudgetStatus month={currentMonth} />
            <PaymentMethodChart month={currentMonth} />
            <DashboardCharts month={currentMonth} />
            <StoreChart month={currentMonth} />
            <ExpenseAnalyzer />
            <ExpenseCSVDownloader />
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;