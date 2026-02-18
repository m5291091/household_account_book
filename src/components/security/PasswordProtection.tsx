"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { hashPasscode } from '@/lib/security';

interface PasswordProtectionProps {
  children: React.ReactNode;
  featureKey: string; // e.g., 'simulation', 'yearlyReport'
  title?: string;
  description?: string;
}

const PasswordProtection = ({ children, featureKey, title = 'パスワード保護', description = 'このコンテンツを表示するにはパスワードを入力してください。' }: PasswordProtectionProps) => {
  const { user, loading: authLoading } = useAuth();
  const [isLocked, setIsLocked] = useState(true);
  const [passcodeHash, setPasscodeHash] = useState<string | null>(null); // null means checking or not set
  const [inputPasscode, setInputPasscode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
        setChecking(false);
        return;
    }

    const checkLockSettings = async () => {
      try {
        // Check session storage first
        const sessionKey = `unlocked_${user.uid}_${featureKey}`;
        if (sessionStorage.getItem(sessionKey) === 'true') {
            setIsLocked(false);
            setChecking(false);
            return;
        }

        const docRef = doc(db, 'users', user.uid, 'settings', 'security');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Check specific feature lock first, then fallback to global (if supported later)
            // For now, check 'simulationPasscodeHash' if featureKey is 'simulation'
            const hash = data[`${featureKey}PasscodeHash`]; 
            
            if (hash) {
                setPasscodeHash(hash);
                setIsLocked(true);
            } else {
                // No passcode set for this feature
                setIsLocked(false);
            }
        } else {
            setIsLocked(false);
        }
      } catch (err) {
        console.error("Error checking security settings:", err);
        setIsLocked(false); 
      } finally {
        setChecking(false);
      }
    };

    checkLockSettings();
  }, [user, authLoading, featureKey]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcodeHash) return;

    const inputHash = await hashPasscode(inputPasscode);
    if (inputHash === passcodeHash) {
        setIsLocked(false);
        setError('');
        if (user) {
            sessionStorage.setItem(`unlocked_${user.uid}_${featureKey}`, 'true');
        }
    } else {
        setError('パスワードが正しくありません。');
        setInputPasscode('');
    }
  };

  if (authLoading || checking) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">セキュリティ確認中...</div>;
  }

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
      <div className="w-full max-w-md bg-white dark:bg-black p-8 rounded-lg shadow-md">
        <div className="text-center mb-6">
            <div className="bg-indigo-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
            <p className="text-gray-600 dark:text-gray-300 mt-2">{description}</p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
            <div>
                <input
                    type="password"
                    value={inputPasscode}
                    onChange={(e) => setInputPasscode(e.target.value)}
                    placeholder="パスワードを入力"
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center text-lg tracking-widest"
                    autoFocus
                />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-3 rounded hover:bg-indigo-700 font-bold transition-colors"
            >
                ロック解除
            </button>
        </form>
      </div>
    </div>
  );
};

export default PasswordProtection;