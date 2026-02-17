"use client";

import { useState, useRef } from 'react';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import ExpenseList from '@/components/expenses/ExpenseList';
import RegularPaymentProcessor from '@/components/expenses/RegularPaymentProcessor';
import { ExpenseFormData } from '@/types/Expense';
import { Income } from '@/types/Income';
import IncomeForm from '@/components/income/IncomeForm';
import IncomeList from '@/components/income/IncomeList';
import Link from 'next/link';
import LogoutButton from '@/components/auth/LogoutButton';

const TransactionsPage = () => {
  const [copiedExpenseData, setCopiedExpenseData] = useState<Partial<ExpenseFormData> | null>(null);
  const [incomeToEdit, setIncomeToEdit] = useState<Income | null>(null);
  const incomeFormRef = useRef<{ scrollIntoView: () => void }>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const handleCopyExpense = (data: Partial<ExpenseFormData>) => {
    setCopiedExpenseData(data);
    incomeFormRef.current?.scrollIntoView();
  };

  const handleEditIncome = (income: Income) => {
    setIncomeToEdit(income);
    incomeFormRef.current?.scrollIntoView();
  };

  const handleCloseIncomeForm = () => {
    setIncomeToEdit(null);
  };

  return (
    <div className="">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            記録・編集
          </h1>
          <nav className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              ダッシュボード
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              <ExpenseForm initialData={copiedExpenseData} setInitialData={setCopiedExpenseData} />
              <RegularPaymentProcessor month={currentMonth} />
              <IncomeForm ref={incomeFormRef} incomeToEdit={incomeToEdit} onFormClose={handleCloseIncomeForm} />
            </div>
            <div className="space-y-8">
              <ExpenseList 
                month={currentMonth} 
                onEditExpense={() => {}}
                onCopyExpense={handleCopyExpense}
              />
              <IncomeList onEditIncome={handleEditIncome} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TransactionsPage;
