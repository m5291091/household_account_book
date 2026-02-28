"use client";

import { useState, useEffect } from 'react';
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';

const isMobileBrowser = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const auth = getAuth(app);
  const router = useRouter();

  // Handle redirect result after signInWithRedirect (Android/mobile)
  useEffect(() => {
    setLoadingGoogle(true);
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) router.push('/dashboard');
      })
      .catch((err: any) => {
        if (err.code !== 'auth/popup-closed-by-user') setError(err.message);
      })
      .finally(() => setLoadingGoogle(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoadingGoogle(true);
    try {
      const provider = new GoogleAuthProvider();
      if (isMobileBrowser()) {
        // Mobile: use redirect flow (popup not reliable on Android)
        await signInWithRedirect(auth, provider);
        // Navigation happens in useEffect after redirect returns
      } else {
        await signInWithPopup(auth, provider);
        router.push('/dashboard');
        setLoadingGoogle(false);
      }
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') setError(error.message);
      setLoadingGoogle(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-4">ログイン</h2>

      {/* Google login */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loadingGoogle}
        className="w-full flex items-center justify-center gap-3 py-2 px-4 mb-5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium shadow-sm transition-colors disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {loadingGoogle ? 'ログイン中...' : 'Googleでログイン'}
      </button>

      <div className="flex items-center gap-3 mb-5">
        <hr className="flex-1 border-gray-300 dark:border-gray-600" />
        <span className="text-sm text-gray-400">または</span>
        <hr className="flex-1 border-gray-300 dark:border-gray-600" />
      </div>

      <form onSubmit={handleLogin}>
        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-200 text-sm font-bold mb-2" htmlFor="login-email">
            メールアドレス
          </label>
          <input
            type="email"
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-gray-700 dark:text-gray-200 text-sm font-bold mb-2" htmlFor="login-password">
            パスワード
          </label>
          <input
            type="password"
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 mb-3 leading-tight focus:outline-none focus:shadow-outline"
            required
          />
        </div>
        {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
        <div className="flex items-center justify-between">
          <button
            type="submit"
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            ログイン
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;