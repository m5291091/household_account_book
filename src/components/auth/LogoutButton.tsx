// /Users/alphabetagamma/work/APP/household_account_book/src/components/auth/LogoutButton.tsx
"use client";

import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

const LogoutButton = () => {
  const auth = getAuth(app);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // ログアウト成功後、ホームページなどにリダイレクトする処理を追加できます。
    } catch (error: any) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
    >
      ログアウト
    </button>
  );
};

export default LogoutButton;
