"use client";

import RegularPaymentSettings from '@/components/settings/RegularPaymentSettings';
import Link from 'next/link';

const ExpenseSettingsPage = () => {
  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/settings" className="text-blue-500 hover:underline mb-4 inline-block">&larr; 設定一覧に戻る</Link>
          <RegularPaymentSettings />
        </div>
      </main>
    </div>
  );
};

export default ExpenseSettingsPage;
