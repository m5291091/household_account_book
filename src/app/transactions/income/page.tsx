"use client";

import { useState, useRef } from 'react';
import IncomeForm from '@/components/income/IncomeForm';
import IncomeList from '@/components/income/IncomeList';
import { Income } from '@/types/Income';
import RegularIncomeProcessor from '@/components/income/RegularIncomeProcessor';
import DashboardSummary from '@/components/dashboard/DashboardSummary';
import { format, addMonths, subMonths } from 'date-fns';

const IncomePage = () => {
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

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold mb-8 text-gray-900 dark:text-white">収入管理</h1>

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
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-8">
              <DashboardSummary month={currentMonth} />
              <RegularIncomeProcessor month={currentMonth} />
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
