"use client";

import { useState, useRef } from 'react';
import IncomeForm from '@/components/income/IncomeForm';
import IncomeList from '@/components/income/IncomeList';
import Header from '@/components/layout/Header';
import { Income } from '@/types/Income';

const IncomePage = () => {
  const [incomeToEdit, setIncomeToEdit] = useState<Income | null>(null);
  const incomeFormRef = useRef<{ scrollIntoView: () => void }>(null);

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
          <h1 className="text-2xl font-bold mb-8 text-gray-900">収入管理</h1>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              <IncomeForm ref={incomeFormRef} incomeToEdit={incomeToEdit} onFormClose={handleCloseIncomeForm} />
            </div>
            <div className="space-y-8">
              <IncomeList onEditIncome={handleEditIncome} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default IncomePage;
