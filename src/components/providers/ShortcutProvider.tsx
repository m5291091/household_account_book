"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_SHORTCUTS, UserShortcutSettings, ShortcutAction } from '@/types/Shortcut';

const ShortcutProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<UserShortcutSettings | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      const docRef = doc(db, 'users', user.uid, 'settings', 'shortcuts');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSettings(docSnap.data() as UserShortcutSettings);
      } else {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        setSettings({ platform: isMac ? 'mac' : 'other', customKeys: {} });
      }
    };
    fetchSettings();
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!settings) return;
      
      // Check modifiers: Cmd+Shift (Mac) or Ctrl+Shift (Other)
      const isMac = settings.platform === 'mac';
      const metaKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (metaKey && e.shiftKey) {
        const key = e.key.toLowerCase();
        
        // Find action matching the key
        const shortcut = DEFAULT_SHORTCUTS.find(s => {
          const customKey = settings.customKeys[s.action];
          return (customKey || s.defaultKey) === key;
        });

        if (shortcut) {
          e.preventDefault();
          switch (shortcut.action) {
            case 'NAV_DASHBOARD': router.push('/dashboard'); break;
            case 'NAV_EXPENSE_RECORD': router.push('/transactions/expense'); break;
            case 'NAV_INCOME_RECORD': router.push('/transactions/income'); break;
            case 'NAV_CALENDAR': router.push('/calendar'); break;
            case 'NAV_ANALYSIS': router.push('/analysis'); break;
            case 'NAV_YEARLY_REPORT': router.push('/yearly-report'); break;
            case 'NAV_SETTINGS': router.push('/settings'); break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings, router]);

  return <>{children}</>;
};

export default ShortcutProvider;
