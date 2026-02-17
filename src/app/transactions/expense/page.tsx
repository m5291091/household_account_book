"use client";

import { useState } from 'react';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import DashboardSummary from '@/components/dashboard/DashboardSummary';

const RecordExpensePage = () => {
  const [currentMonth] = useState(new Date());

  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <DashboardSummary month={currentMonth} />
            </div>
            <div className="lg:col-span-2">
              <ExpenseForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RecordExpensePage;
