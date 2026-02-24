"use client";

import SecuritySettings from '@/components/settings/SecuritySettings';
import Link from 'next/link';

const SecuritySettingsPage = () => {
  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/settings" className="text-blue-500 hover:underline mb-4 inline-block">&larr; 設定一覧に戻る</Link>
          <SecuritySettings />
        </div>
      </main>
    </div>
  );
};

export default SecuritySettingsPage;