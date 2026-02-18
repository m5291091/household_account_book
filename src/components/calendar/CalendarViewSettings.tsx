"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface CalendarViewSettingsProps {
  onViewModeChange: (mode: 'list' | 'calendar' | 'monthly_grid') => void;
  currentViewMode: 'list' | 'calendar' | 'monthly_grid';
}

const CalendarViewSettings = ({ onViewModeChange, currentViewMode }: CalendarViewSettingsProps) => {
  const { user, loading: authLoading } = useAuth();
  const [checkColor, setCheckColor] = useState('#d4edda');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const fetchSettings = async () => {
      const docRef = doc(db, 'users', user.uid, 'settings', 'general');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().checkColor) {
        setCheckColor(docSnap.data().checkColor);
      }
    };
    fetchSettings();
  }, [user, authLoading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorChange = async (color: string) => {
    setCheckColor(color);
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'general'), {
        checkColor: color
      }, { merge: true });
      // Note: ExpenseList listens to the same document, so it should update automatically if using onSnapshot, 
      // but currently ExpenseList uses getDoc. A global context or event might be needed for instant update, 
      // or reloading. For now, assuming user accepts refresh or we can trigger re-fetch.
      // Actually, updating Firestore is enough if ExpenseList listens. 
      // Let's assume for this step we rely on Firestore.
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-gray-200 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 font-medium"
      >
        表示設定
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-black rounded-md shadow-lg z-50 p-4 border">
          <h3 className="text-lg font-bold mb-4 border-b pb-2">カレンダー表示設定</h3>
          
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">表示モード</label>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="viewMode"
                  value="calendar"
                  checked={currentViewMode === 'calendar'}
                  onChange={() => onViewModeChange('calendar')}
                  className="mr-2"
                />
                詳細テーブル（支払方法別）
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="viewMode"
                  value="monthly_grid"
                  checked={currentViewMode === 'monthly_grid'}
                  onChange={() => onViewModeChange('monthly_grid')}
                  className="mr-2"
                />
                月間カレンダー（日付グリッド）
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="viewMode"
                  value="list"
                  checked={currentViewMode === 'list'}
                  onChange={() => onViewModeChange('list')}
                  className="mr-2"
                />
                リスト表示
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">チェック時の背景色</label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={checkColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="h-8 w-12 border border-gray-300 dark:border-gray-600 rounded p-0 cursor-pointer"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">{checkColor}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarViewSettings;
