"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/auth/LogoutButton';

const Header = () => {
  const pathname = usePathname();

  const navItems = [
    { name: '支出記録', href: '/transactions/expense' },
    { name: 'ダッシュボード', href: '/dashboard' },
    { name: '収入管理', href: '/transactions/income' },
    { name: '支出分析', href: '/analysis' },
    { name: 'シミュレーション', href: '/analysis/simulation' },
    { name: 'カレンダー', href: '/calendar' },
    { name: '年間レポート', href: '/yearly-report' },
    { name: '設定', href: '/settings' },
  ];

  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-6 md:space-y-0">
          <div className="flex items-center">
            <Link href="/transactions/expense" className="text-2xl font-bold text-gray-900 hover:text-gray-700 transition duration-150">
              収支管理アプリ
            </Link>
          </div>
          
          <nav className="flex flex-wrap justify-center items-center gap-4 md:gap-6">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    px-4 py-2 mx-2 my-1 rounded-md text-sm font-medium transition duration-200 border
                    ${isActive 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:text-indigo-600 hover:border-indigo-300'
                    }
                  `}
                >
                  {item.name}
                </Link>
              );
            })}
            <div className="ml-2 pl-2 border-l border-gray-300">
              <LogoutButton />
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
