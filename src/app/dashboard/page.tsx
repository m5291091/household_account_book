"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import DashboardSummary from '@/components/dashboard/DashboardSummary';
import IncomeExpenseChart from '@/components/dashboard/IncomeExpenseChart';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import PaymentMethodChart from '@/components/dashboard/PaymentMethodChart';
import BudgetStatus from '@/components/dashboard/BudgetStatus';
import { format, addMonths, subMonths } from 'date-fns';
import IncomeCategoryChart from '@/components/dashboard/IncomeCategoryChart';
import StoreChart from '@/components/dashboard/StoreChart';
import CreditCardStatus from '@/components/dashboard/CreditCardStatus';
import SavingsGoalStatus from '@/components/dashboard/SavingsGoalStatus';
import DashboardFilterBar from '@/components/dashboard/DashboardFilterBar';

const DashboardPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showTransfers, setShowTransfers] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xl">読み込み中...</p>
      </div>
    );
  }

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
            <DashboardSummary month={currentMonth} />
            <SavingsGoalStatus month={currentMonth} />
            <CreditCardStatus month={currentMonth} />

            {/* グラフ絞り込みフィルター（カード・自動引き落とし予定の下） */}
            <DashboardFilterBar
              showTransfers={showTransfers}
              onShowTransfersChange={setShowTransfers}
              paymentMethodFilter={paymentMethodFilter}
              onPaymentMethodFilterChange={setPaymentMethodFilter}
            />

            <IncomeExpenseChart month={currentMonth} showTransfers={showTransfers} />
            <IncomeCategoryChart month={currentMonth} />
            <BudgetStatus month={currentMonth} />
            <PaymentMethodChart month={currentMonth} showTransfers={showTransfers} paymentMethodFilter={paymentMethodFilter} />
            <DashboardCharts month={currentMonth} showTransfers={showTransfers} paymentMethodFilter={paymentMethodFilter} />
            <StoreChart month={currentMonth} showTransfers={showTransfers} paymentMethodFilter={paymentMethodFilter} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
