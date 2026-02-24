"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { CheckStatus } from '@/types/Expense';

const DisplaySettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [checkStatuses, setCheckStatuses] = useState<CheckStatus[]>([
    { id: 'default', color: '#d4edda', label: '確認済み' }
  ]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const fetchSettings = async () => {
      const docRef = doc(db, 'users', user.uid, 'settings', 'general');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().checkStatuses) {
        setCheckStatuses(docSnap.data().checkStatuses);
      } else if (docSnap.exists() && docSnap.data().checkColor) {
        setCheckStatuses([{ id: 'default', color: docSnap.data().checkColor, label: '確認済み' }]);
      }
      setLoading(false);
    };
    fetchSettings();
  }, [user, authLoading]);

  const handleUpdateStatus = (index: number, field: keyof CheckStatus, value: string) => {
    const newStatuses = [...checkStatuses];
    newStatuses[index] = { ...newStatuses[index], [field]: value };
    setCheckStatuses(newStatuses);
  };

  const handleAddStatus = () => {
    const newStatuses = [...checkStatuses, { id: Date.now().toString(), color: '#ffff00', label: '新規ステータス' }];
    setCheckStatuses(newStatuses);
  };

  const handleDeleteStatus = (index: number) => {
    const newStatuses = checkStatuses.filter((_, i) => i !== index);
    setCheckStatuses(newStatuses);
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'general'), {
        checkStatuses
      }, { merge: true });
      setMessage('設定を保存しました。');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage('保存に失敗しました。');
    }
  };

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">表示設定</h2>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
          カレンダーのチェック時の状態と背景色
        </label>
        <div className="space-y-3">
          {checkStatuses.map((status, index) => (
            <div key={status.id} className="flex items-center space-x-2">
              <input
                type="color"
                value={status.color}
                onChange={(e) => handleUpdateStatus(index, 'color', e.target.value)}
                className="h-10 w-20 border border-gray-300 dark:border-gray-600 rounded p-1 cursor-pointer flex-shrink-0"
              />
              <input
                type="text"
                value={status.label}
                onChange={(e) => handleUpdateStatus(index, 'label', e.target.value)}
                className="flex-grow p-2 border rounded bg-white dark:bg-black"
                placeholder="ステータス名"
              />
              {checkStatuses.length > 1 && (
                <button onClick={() => handleDeleteStatus(index)} className="text-red-500 hover:text-red-700 font-bold px-3 py-2 bg-red-50 rounded">
                  削除
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={handleAddStatus}
            className="mt-2 py-2 px-4 text-sm bg-indigo-50 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-100 transition"
          >
            + ステータスを追加
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">※カレンダー上でクリックすると、ここで設定したステータスの順に切り替わります。</p>
      </div>
      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 transition"
      >
        保存
      </button>
      {message && <p className="mt-2 text-sm text-green-600 font-bold">{message}</p>}
    </div>
  );
};

export default DisplaySettings;