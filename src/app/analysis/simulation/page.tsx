"use client";

import BalanceSimulator from '@/components/analysis/BalanceSimulator';
import Link from 'next/link';

const SimulationPage = () => {
  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-gray-900">資産シミュレーション</h1>
            <Link href="/settings/accounts" className="text-blue-500 hover:underline text-sm">
              口座・残高を設定する &rarr;
            </Link>
          </div>
          
          <BalanceSimulator />
        </div>
      </main>
    </div>
  );
};

export default SimulationPage;
