// /Users/alphabetagamma/work/APP/household_account_book/src/app/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from "@/contexts/AuthContext";
import SignUp from "@/components/auth/SignUp";
import Login from "@/components/auth/Login";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <p className="text-xl">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-10">家計簿アプリ</h1>
        <div className="w-full max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <SignUp />
            <Login />
          </div>
        </div>
      </div>
    </main>
  );
}
