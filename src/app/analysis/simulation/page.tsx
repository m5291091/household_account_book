"use client";

import BalanceSimulator from '@/components/analysis/BalanceSimulator';
import Link from 'next/link';
import PasswordProtection from '@/components/security/PasswordProtection';

const SimulationPage = () => {
  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <PasswordProtection 
            featureKey="simulation" 
            title="資産シミュレーションの保護" 
            description="この機能にはパスワードロックがかかっています。閲覧するにはパスワードを入力してください。"
          >
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">資産シミュレーション</h1>
              <Link href="/settings/payment-methods" className="text-blue-500 hover:underline text-sm">
                口座・残高を設定する &rarr;
              </Link>
            </div>
            
            <BalanceSimulator />
          </PasswordProtection>
        </div>
      </main>
    </div>
  );
};

export default SimulationPage;
