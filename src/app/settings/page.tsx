// /Users/alphabetagamma/work/APP/household_account_book/src/app/settings/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
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
      <div className="flex h-full items-center justify-center">
        <p className="text-xl">読み込み中...</p>
      </div>
    );
  }

  const menuItems = [
    {
      title: '支出の管理',
      description: '定期的な支出（家賃、サブスクリプションなど）を管理します。',
      href: '/settings/expenses',
      icon: '💸',
    },
    {
      title: '収入の管理',
      description: '定期的な収入（給料、年金など）を管理します。',
      href: '/settings/incomes',
      icon: '💰',
    },
    {
      title: '支払い方法・口座管理',
      description: '支払い方法、銀行口座、クレジットカードを管理します。',
      href: '/settings/payment-methods',
      icon: '💳',
    },
    {
      title: 'カテゴリー管理',
      description: '支出や収入のカテゴリーをカスタマイズします。',
      href: '/settings/categories',
      icon: '🏷️',
    },
    {
      title: '表示設定',
      description: 'カレンダーの表示色などをカスタマイズします。',
      href: '/settings/display',
      icon: '🎨',
    },
    {
      title: 'ショートカット設定',
      description: 'アプリ内のキーボードショートカットを設定します。',
      href: '/settings/shortcuts',
      icon: '⌨️',
    },
    {
      title: 'セキュリティ設定',
      description: 'アプリのロックやパスワード設定を行います。',
      href: '/settings/security',
      icon: '🔒',
    },
  ];

  return (
    <div className="">
      <main className="pt-8 pb-32">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">設定</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {menuItems.map((item) => (
              <Link key={item.href} href={item.href} className="group block">
                <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 h-full border border-transparent hover:border-indigo-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-4xl">{item.icon}</div>
                    <span className="text-gray-400 group-hover:text-indigo-500 transition-colors">
                      &rarr;
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 transition-colors">
                    {item.title}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300">
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
