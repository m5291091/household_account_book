"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LogoutButton from '@/components/auth/LogoutButton';
import Link from 'next/link';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ExpenseList from '@/components/expenses/ExpenseList';
import RegularPaymentProcessor from '@/components/expenses/RegularPaymentProcessor';
import DashboardSummary from '@/components/dashboard/DashboardSummary';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import PaymentMethodChart from '@/components/dashboard/PaymentMethodChart';
import BudgetStatus from '@/components/dashboard/BudgetStatus';
import ExpenseAnalyzer from '@/components/dashboard/ExpenseAnalyzer';
import { format, addMonths, subMonths } from 'date-fns';
import { Expense, ExpenseFormData } from '@/types/Expense';

const DashboardPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [copiedExpenseData, setCopiedExpenseData] = useState<Partial<ExpenseFormData> | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

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

  const handleEditExpense = (expense: Expense) => {
    setExpenseToEdit(expense);
  };

  const handleCopyExpense = (data: Partial<ExpenseFormData>) => {
    setCopiedExpenseData(data);
    // Scroll to the top to make the form visible if it's off-screen
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeEditModal = () => {
    setExpenseToEdit(null);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            ダッシュボード
          </h1>
          <nav className="flex items-center space-x-4">
            <Link href="/settings" className="text-gray-600 hover:text-gray-900">
              設定
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="py-8">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column for Analysis */}
            <div className="space-y-8">
              <DashboardSummary month={currentMonth} />
              <BudgetStatus month={currentMonth} />
              <PaymentMethodChart month={currentMonth} />
              <DashboardCharts month={currentMonth} />
              <ExpenseAnalyzer />
            </div>

            {/* Right Column for Data Entry */}
            <div className="space-y-8">
              <ExpenseForm initialData={copiedExpenseData} setInitialData={setCopiedExpenseData} />
              <RegularPaymentProcessor month={currentMonth} />
              <ExpenseList 
                month={currentMonth} 
                onEditExpense={handleEditExpense}
                onCopyExpense={handleCopyExpense}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Edit Expense Modal */}
      {expenseToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <ExpenseForm expenseToEdit={expenseToEdit} onFormClose={closeEditModal} />
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;