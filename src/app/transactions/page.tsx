"use client";

import { useState, useRef } from 'react';
import ExpenseList from '@/components/expenses/ExpenseList';
import RegularPaymentProcessor from '@/components/expenses/RegularPaymentProcessor';
import { ExpenseFormData } from '@/types/Expense';
import { Income } from '@/types/Income';
import IncomeForm from '@/components/income/IncomeForm';
import IncomeList from '@/components/income/IncomeList';
import Header from '@/components/layout/Header';

const TransactionsPage = () => {
  const [incomeToEdit, setIncomeToEdit] = useState<Income | null>(null);
  const incomeFormRef = useRef<{ scrollIntoView: () => void }>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const handleEditIncome = (income: Income) => {
    setIncomeToEdit(income);
    incomeFormRef.current?.scrollIntoView();
  };

  const handleCloseIncomeForm = () => {
    setIncomeToEdit(null);
  };

  return (
    <div className="">
      <Header />

      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              <RegularPaymentProcessor month={currentMonth} />
              <IncomeForm ref={incomeFormRef} incomeToEdit={incomeToEdit} onFormClose={handleCloseIncomeForm} />
            </div>
            <div className="space-y-8">
              <ExpenseList 
                month={currentMonth} 
                onEditExpense={() => {}}
                onCopyExpense={(data) => {
                  // TODO: Implement copy functionality with navigation
                  console.log('Copy feature to be implemented for new page', data);
                  alert("コピー機能は現在調整中です。");
                }}
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
