"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardFilterBarProps {
  showTransfers: boolean;
  onShowTransfersChange: (v: boolean) => void;
  paymentMethodFilter: string[];
  onPaymentMethodFilterChange: (v: string[]) => void;
}

const DashboardFilterBar = ({
  showTransfers,
  onShowTransfersChange,
  paymentMethodFilter,
  onPaymentMethodFilterChange,
}: DashboardFilterBarProps) => {
  const { user } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'users', user.uid, 'paymentMethods')),
      snap => setPaymentMethods(snap.docs.map(d => ({ id: d.id, name: d.data().name as string })))
    );
    return () => unsub();
  }, [user]);

  const togglePaymentMethod = (id: string) => {
    if (paymentMethodFilter.includes(id)) {
      onPaymentMethodFilterChange(paymentMethodFilter.filter(v => v !== id));
    } else {
      onPaymentMethodFilterChange([...paymentMethodFilter, id]);
    }
  };

  const hasFilter = showTransfers || paymentMethodFilter.length > 0;

  return (
    <div className="bg-white dark:bg-black p-4 rounded-lg shadow-md">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 shrink-0">🔍 グラフの絞り込み：</span>

        {/* 振替トグル */}
        <button
          type="button"
          onClick={() => onShowTransfersChange(!showTransfers)}
          className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors shrink-0 ${
            showTransfers
              ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-300'
              : 'bg-gray-50 border-gray-300 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 hover:border-amber-400'
          }`}
        >
          {showTransfers ? '✓ 振替を含む' : '振替を除外中'}
        </button>

        {/* 支払い方法ピル（複数選択） */}
        {paymentMethods.map(pm => {
          const selected = paymentMethodFilter.includes(pm.id);
          return (
            <button
              key={pm.id}
              type="button"
              onClick={() => togglePaymentMethod(pm.id)}
              className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                selected
                  ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500'
                  : 'bg-white border-gray-300 text-gray-600 dark:bg-black dark:border-gray-600 dark:text-gray-400 hover:border-indigo-400'
              }`}
            >
              {selected ? `✓ ${pm.name}` : pm.name}
            </button>
          );
        })}

        {/* リセット */}
        {hasFilter && (
          <button
            type="button"
            onClick={() => { onShowTransfersChange(false); onPaymentMethodFilterChange([]); }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline shrink-0"
          >
            リセット
          </button>
        )}
      </div>

      {paymentMethodFilter.length > 0 && (
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2">
          ※ 選択中の支払い方法のみ集計（{paymentMethodFilter.length}件）
        </p>
      )}
    </div>
  );
};

export default DashboardFilterBar;
