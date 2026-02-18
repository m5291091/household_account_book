"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_SHORTCUTS, UserShortcutSettings, ShortcutAction } from '@/types/Shortcut';

const ShortcutSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [platform, setPlatform] = useState<'mac' | 'other'>('mac');
  const [customKeys, setCustomKeys] = useState<{ [key in ShortcutAction]?: string }>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const fetchSettings = async () => {
      const docRef = doc(db, 'users', user.uid, 'settings', 'shortcuts');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserShortcutSettings;
        setPlatform(data.platform || 'mac');
        setCustomKeys(data.customKeys || {});
      } else {
        // Try to guess platform
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        setPlatform(isMac ? 'mac' : 'other');
      }
      setLoading(false);
    };
    fetchSettings();
  }, [user, authLoading]);

  const handleSave = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'settings', 'shortcuts'), {
        platform,
        customKeys
      });
      setMessage('設定を保存しました。');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setMessage('保存に失敗しました。');
    }
  };

  const handleKeyChange = (action: ShortcutAction, value: string) => {
    if (value.length > 1) return; // Single char only
    setCustomKeys(prev => ({ ...prev, [action]: value.toLowerCase() }));
  };

  const modifier = platform === 'mac' ? 'Command + Shift +' : 'Ctrl + Shift +';

  if (loading) return <p>読み込み中...</p>;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">ショートカットキー設定</h2>
      
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">プラットフォーム</label>
        <div className="flex space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              value="mac"
              checked={platform === 'mac'}
              onChange={() => setPlatform('mac')}
              className="mr-2"
            />
            Mac (Command + Shift)
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="other"
              checked={platform === 'other'}
              onChange={() => setPlatform('other')}
              className="mr-2"
            />
            Windows / その他 (Ctrl + Shift)
          </label>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {DEFAULT_SHORTCUTS.map(shortcut => (
          <div key={shortcut.action} className="flex items-center justify-between border-b pb-2">
            <div>
              <p className="font-medium">{shortcut.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{shortcut.description}</p>
            </div>
            <div className="flex items-center">
              <span className="text-gray-500 dark:text-gray-400 mr-2">{modifier}</span>
              <input
                type="text"
                value={customKeys[shortcut.action] || shortcut.defaultKey}
                onChange={(e) => handleKeyChange(shortcut.action, e.target.value)}
                className="w-10 p-1 border rounded text-center font-mono uppercase"
                maxLength={1}
              />
            </div>
          </div>
        ))}
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

export default ShortcutSettings;
