"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/auth/LogoutButton';
import { useTheme } from '@/contexts/ThemeContext';

const Header = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

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
    <header className="bg-white dark:bg-black shadow-md sticky top-0 z-50 transition-colors duration-200">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-6 md:space-y-0">
          <div className="flex items-center">
            <Link href="/transactions/expense" className="text-2xl font-bold text-gray-900 dark:text-white hover:text-gray-700 dark:text-gray-200 dark:hover:text-gray-300 transition duration-150">
              収支管理アプリ
            </Link>
          </div>
          
          <nav className="flex flex-wrap justify-center items-center gap-1 md:gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    px-3 py-2 mx-0.5 my-1 rounded-md text-sm font-medium transition duration-200 border
                    ${isActive 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                      : 'bg-white dark:bg-black text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:bg-gray-900 hover:text-indigo-600 hover:border-indigo-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 dark:hover:text-white'
                    }
                  `}
                >
                  {item.name}
                </Link>
              );
            })}
            <div className="ml-2 pl-2 border-l border-gray-300 dark:border-gray-600 dark:border-gray-600 flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle Dark Mode"
              >
                {theme === 'light' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-600 dark:text-gray-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-yellow-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                )}
              </button>
              <LogoutButton />
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
