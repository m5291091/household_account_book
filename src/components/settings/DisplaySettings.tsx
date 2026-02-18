"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

const DisplaySettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [checkColor, setCheckColor] = useState('#d4edda'); // Default green-ish
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const fetchSettings = async () => {
      const docRef = doc(db, 'users', user.uid, 'settings', 'general');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().checkColor) {
        setCheckColor(docSnap.data().checkColor);
      }
      setLoading(false);
    };
    fetchSettings();
  }, [user, authLoading]);

  const handleSave = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'general'), {
        checkColor
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
          カレンダーのチェック時の背景色
        </label>
        <div className="flex items-center space-x-4">
          <input
            type="color"
            value={checkColor}
            onChange={(e) => setCheckColor(e.target.value)}
            className="h-10 w-20 border border-gray-300 dark:border-gray-600 rounded p-1"
          />
          <span className="text-gray-600 dark:text-gray-300">{checkColor}</span>
        </div>
      </div>
      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        保存
      </button>
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
    </div>
  );
};

export default DisplaySettings;
