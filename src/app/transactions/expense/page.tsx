"use client";

import { useState } from 'react';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import DashboardSummary from '@/components/dashboard/DashboardSummary';
import Link from 'next/link';
import LogoutButton from '@/components/auth/LogoutButton';

const RecordExpensePage = () => {
  const [currentMonth] = useState(new Date());

  return (
    <div className="">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            支出を記録
          </h1>
          <nav className="flex items-center space-x-4">
            <Link href="/transactions" className="text-gray-600 hover:text-gray-900">
              記録・編集一覧
            </Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              ダッシュボード
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

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
