"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { hashPasscode } from '@/lib/security';

const SecuritySettings = () => {
  const { user } = useAuth();
  const [hasSimulationPasscode, setHasSimulationPasscode] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeAction, setActiveAction] = useState<'none' | 'set' | 'change' | 'remove'>('none');

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'users', user.uid, 'settings', 'security');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().simulationPasscodeHash) {
            setHasSimulationPasscode(true);
        } else {
            setHasSimulationPasscode(false);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [user]);

  const resetForm = () => {
    setCurrentPasscode('');
    setNewPasscode('');
    setConfirmPasscode('');
    setError('');
    setSuccess('');
    setActiveAction('none');
  };

  const handleSetPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (newPasscode !== confirmPasscode) {
        setError('新しいパスワードが一致しません。');
        return;
    }
    if (newPasscode.length < 4) {
        setError('パスワードは4文字以上で設定してください。');
        return;
    }

    try {
        const hash = await hashPasscode(newPasscode);
        const docRef = doc(db, 'users', user.uid, 'settings', 'security');
        await setDoc(docRef, { simulationPasscodeHash: hash }, { merge: true });
        
        setHasSimulationPasscode(true);
        setSuccess('パスワードを設定しました。');
        setTimeout(resetForm, 2000);
    } catch (err) {
        console.error(err);
        setError('設定に失敗しました。');
    }
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    // Verify current
    // Note: Since we only store hash, we need to hash input and compare.
    // Fetch current hash first
    const docRef = doc(db, 'users', user.uid, 'settings', 'security');
    const docSnap = await getDoc(docRef);
    const currentHash = docSnap.data()?.simulationPasscodeHash;

    const inputCurrentHash = await hashPasscode(currentPasscode);
    if (inputCurrentHash !== currentHash) {
        setError('現在のパスワードが間違っています。');
        return;
    }

    if (newPasscode !== confirmPasscode) {
        setError('新しいパスワードが一致しません。');
        return;
    }
    if (newPasscode.length < 4) {
        setError('パスワードは4文字以上で設定してください。');
        return;
    }

    try {
        const hash = await hashPasscode(newPasscode);
        await updateDoc(docRef, { simulationPasscodeHash: hash });
        setSuccess('パスワードを変更しました。');
        setTimeout(resetForm, 2000);
    } catch (err) {
        console.error(err);
        setError('変更に失敗しました。');
    }
  };

  const handleRemovePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Verify current
    const docRef = doc(db, 'users', user.uid, 'settings', 'security');
    const docSnap = await getDoc(docRef);
    const currentHash = docSnap.data()?.simulationPasscodeHash;

    const inputCurrentHash = await hashPasscode(currentPasscode);
    if (inputCurrentHash !== currentHash) {
        setError('パスワードが間違っています。');
        return;
    }

    try {
        await updateDoc(docRef, { simulationPasscodeHash: deleteField() });
        setHasSimulationPasscode(false);
        setSuccess('パスワード保護を解除しました。');
        setTimeout(resetForm, 2000);
    } catch (err) {
        console.error(err);
        setError('解除に失敗しました。');
    }
  };

  if (loading) return <div>読み込み中...</div>;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">セキュリティ設定</h2>
      
      <div className="border-b pb-6 mb-6">
        <div className="flex justify-between items-center mb-4">
            <div>
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">シミュレーション機能の保護</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {hasSimulationPasscode 
                        ? '現在、シミュレーション機能はパスワードで保護されています。' 
                        : 'シミュレーション機能へのアクセスにパスワードを設定できます。'}
                </p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-bold ${hasSimulationPasscode ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                {hasSimulationPasscode ? '保護中' : '未設定'}
            </div>
        </div>

        {activeAction === 'none' && (
            <div className="flex gap-4 mt-4">
                {!hasSimulationPasscode ? (
                    <button 
                        onClick={() => setActiveAction('set')}
                        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                    >
                        設定する
                    </button>
                ) : (
                    <>
                        <button 
                            onClick={() => setActiveAction('change')}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                            変更する
                        </button>
                        <button 
                            onClick={() => setActiveAction('remove')}
                            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                        >
                            解除する
                        </button>
                    </>
                )}
            </div>
        )}

        {/* Forms */}
        {activeAction === 'set' && (
            <form onSubmit={handleSetPasscode} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg mt-4 space-y-4 animate-fade-in">
                <h4 className="font-bold text-gray-700 dark:text-gray-200">新規パスワード設定</h4>
                <input 
                    type="password" 
                    placeholder="新しいパスワード" 
                    value={newPasscode} 
                    onChange={e => setNewPasscode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                />
                <input 
                    type="password" 
                    placeholder="パスワード確認" 
                    value={confirmPasscode} 
                    onChange={e => setConfirmPasscode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                />
                <div className="flex gap-2">
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">保存</button>
                    <button type="button" onClick={resetForm} className="bg-gray-300 text-gray-700 dark:text-gray-200 px-4 py-2 rounded hover:bg-gray-400">キャンセル</button>
                </div>
            </form>
        )}

        {activeAction === 'change' && (
            <form onSubmit={handleChangePasscode} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg mt-4 space-y-4 animate-fade-in">
                <h4 className="font-bold text-gray-700 dark:text-gray-200">パスワード変更</h4>
                <input 
                    type="password" 
                    placeholder="現在のパスワード" 
                    value={currentPasscode} 
                    onChange={e => setCurrentPasscode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                />
                <input 
                    type="password" 
                    placeholder="新しいパスワード" 
                    value={newPasscode} 
                    onChange={e => setNewPasscode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                />
                <input 
                    type="password" 
                    placeholder="新しいパスワード (確認)" 
                    value={confirmPasscode} 
                    onChange={e => setConfirmPasscode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                />
                <div className="flex gap-2">
                    <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">更新</button>
                    <button type="button" onClick={resetForm} className="bg-gray-300 text-gray-700 dark:text-gray-200 px-4 py-2 rounded hover:bg-gray-400">キャンセル</button>
                </div>
            </form>
        )}

        {activeAction === 'remove' && (
            <form onSubmit={handleRemovePasscode} className="bg-red-50 p-4 rounded-lg mt-4 space-y-4 animate-fade-in border border-red-100">
                <h4 className="font-bold text-red-700">パスワード保護の解除</h4>
                <p className="text-sm text-red-600 mb-2">解除するには現在のパスワードを入力してください。</p>
                <input 
                    type="password" 
                    placeholder="現在のパスワード" 
                    value={currentPasscode} 
                    onChange={e => setCurrentPasscode(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                />
                <div className="flex gap-2">
                    <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">解除実行</button>
                    <button type="button" onClick={resetForm} className="bg-gray-300 text-gray-700 dark:text-gray-200 px-4 py-2 rounded hover:bg-gray-400">キャンセル</button>
                </div>
            </form>
        )}

        {error && <p className="text-red-500 mt-4 font-bold">{error}</p>}
        {success && <p className="text-green-500 mt-4 font-bold">{success}</p>}
      </div>
    </div>
  );
};

export default SecuritySettings;