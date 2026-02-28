"use client";

import ExpenseAnalyzer from '@/components/dashboard/ExpenseAnalyzer';
import ExpenseCSVDownloader from '@/components/dashboard/ExpenseCSVDownloader';
import ExpensePredictor from '@/components/dashboard/ExpensePredictor';
import SavingsRangeAnalyzer from '@/components/dashboard/SavingsRangeAnalyzer';

const AnalysisPage = () => {
  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold mb-8 text-gray-900 dark:text-white">支出分析</h1>
          
          <div className="space-y-8">
            <SavingsRangeAnalyzer />
            <ExpensePredictor />
            <ExpenseAnalyzer />
            <ExpenseCSVDownloader />
          </div>
        </div>
      </main>
    </div>
  );
};

export default AnalysisPage;
