// /Users/alphabetagamma/work/APP/household_account_book/src/app/settings/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LogoutButton from '@/components/auth/LogoutButton';
import CategorySettings from '@/components/settings/CategorySettings';
import PaymentMethodSettings from '@/components/settings/PaymentMethodSettings';
import RegularPaymentSettings from '@/components/settings/RegularPaymentSettings';
import IncomeCategorySettings from '@/components/settings/IncomeCategorySettings';
import Link from 'next/link';

const SettingsPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">設定</h1>
          <nav className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              ダッシュボードへ
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            <RegularPaymentSettings />
            <CategorySettings />
            <IncomeCategorySettings />
            <PaymentMethodSettings />
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
