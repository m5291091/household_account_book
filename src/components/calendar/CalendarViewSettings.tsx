"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { CheckStatus } from '@/types/Expense';

interface CalendarViewSettingsProps {
  onViewModeChange: (mode: 'list' | 'calendar' | 'monthly_grid') => void;
  currentViewMode: 'list' | 'calendar' | 'monthly_grid';
}

const CalendarViewSettings = ({ onViewModeChange, currentViewMode }: CalendarViewSettingsProps) => {
  const { user, loading: authLoading } = useAuth();
  const [checkStatuses, setCheckStatuses] = useState<CheckStatus[]>([
    { id: 'default', color: '#d4edda', label: '確認済み' }
  ]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const docRef = doc(db, 'users', user.uid, 'settings', 'general');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().checkStatuses) {
        setCheckStatuses(docSnap.data().checkStatuses);
      } else if (docSnap.exists() && docSnap.data().checkColor) {
        setCheckStatuses([{ id: 'default', color: docSnap.data().checkColor, label: '確認済み' }]);
      }
    });
    return () => unsub();
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

  const saveStatuses = async (newStatuses: CheckStatus[]) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'general'), {
        checkStatuses: newStatuses
      }, { merge: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = (index: number, field: keyof CheckStatus, value: string) => {
    const newStatuses = [...checkStatuses];
    newStatuses[index] = { ...newStatuses[index], [field]: value };
    setCheckStatuses(newStatuses); // Optimistic
    saveStatuses(newStatuses);
  };

  const handleAddStatus = () => {
    const newStatuses = [...checkStatuses, { id: Date.now().toString(), color: '#ffff00', label: '新規ステータス' }];
    setCheckStatuses(newStatuses);
    saveStatuses(newStatuses);
  };

  const handleDeleteStatus = (index: number) => {
    const newStatuses = checkStatuses.filter((_, i) => i !== index);
    setCheckStatuses(newStatuses);
    saveStatuses(newStatuses);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-gray-200 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 font-medium"
      >
        表示設定
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-black rounded-md shadow-lg z-50 p-4 border max-h-[80vh] overflow-y-auto">
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
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">チェック時の状態と背景色</label>
            <div className="space-y-3">
              {checkStatuses.map((status, index) => (
                <div key={status.id} className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={status.color}
                    onChange={(e) => handleUpdateStatus(index, 'color', e.target.value)}
                    className="h-8 w-8 border border-gray-300 dark:border-gray-600 rounded p-0 cursor-pointer flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={status.label}
                    onChange={(e) => handleUpdateStatus(index, 'label', e.target.value)}
                    className="flex-grow p-1 border rounded text-sm bg-white dark:bg-black"
                    placeholder="ステータス名"
                  />
                  {checkStatuses.length > 1 && (
                    <button onClick={() => handleDeleteStatus(index)} className="text-red-500 hover:text-red-700 font-bold px-1">
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button 
                onClick={handleAddStatus}
                className="w-full mt-2 py-1 text-sm bg-indigo-50 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-100 transition"
              >
                + ステータスを追加
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">※カレンダー上でクリックすると、ここで設定したステータスの順に切り替わります。</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarViewSettings;
