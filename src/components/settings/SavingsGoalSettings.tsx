"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, Timestamp, query, orderBy,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { SavingsGoal, SavingsGoalFormData, SavingsGoalType } from '@/types/SavingsGoal';
import { Account } from '@/types/Account';

const DEFAULT_FORM: SavingsGoalFormData = {
  name: '',
  type: 'fixed',
  amount: '',
  percentage: '',
  linkedAccountId: '',
};

const SavingsGoalSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState<SavingsGoalFormData>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const unsubAccounts = onSnapshot(
      query(collection(db, 'users', user.uid, 'accounts')),
      s => setAccounts(s.docs.map(d => ({ id: d.id, ...d.data() } as Account)))
    );
    const unsubGoals = onSnapshot(
      query(collection(db, 'users', user.uid, 'savingsGoals'), orderBy('updatedAt', 'desc')),
      s => {
        setGoals(s.docs.map(d => ({ id: d.id, ...d.data() } as SavingsGoal)));
        setLoading(false);
      }
    );
    return () => { unsubAccounts(); unsubGoals(); };
  }, [user, authLoading]);

  const resetForm = () => {
    setFormData(DEFAULT_FORM);
    setEditingId(null);
    setError(null);
    setSuccess(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEdit = (goal: SavingsGoal) => {
    setFormData({
      name: goal.name,
      type: goal.type,
      amount: goal.type === 'fixed' ? String(goal.amount) : '',
      percentage: goal.type === 'percentage' ? String(goal.percentage) : '',
      linkedAccountId: goal.linkedAccountId || '',
    });
    setEditingId(goal.id);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.name.trim()) {
      setError('名称を入力してください。');
      return;
    }
    if (formData.type === 'fixed' && !formData.amount) {
      setError('金額を入力してください。');
      return;
    }
    if (formData.type === 'percentage' && !formData.percentage) {
      setError('割合を入力してください。');
      return;
    }
    if (!formData.linkedAccountId) {
      setError('貯金先口座を選択してください。');
      return;
    }

    const pct = Number(formData.percentage);
    if (formData.type === 'percentage' && (pct <= 0 || pct > 100)) {
      setError('割合は1〜100の範囲で入力してください。');
      return;
    }

    const dataToSave = {
      name: formData.name.trim(),
      type: formData.type as SavingsGoalType,
      amount: formData.type === 'fixed' ? Number(formData.amount) : 0,
      percentage: formData.type === 'percentage' ? pct : 0,
      linkedAccountId: formData.linkedAccountId,
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'users', user.uid, 'savingsGoals', editingId), dataToSave);
        setSuccess('貯金目標を更新しました。');
      } else {
        await addDoc(collection(db, 'users', user.uid, 'savingsGoals'), dataToSave);
        setSuccess('貯金目標を追加しました。');
      }
      resetForm();
    } catch (err) {
      console.error(err);
      setError(editingId ? '更新に失敗しました。' : '追加に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('この貯金目標を削除しますか？')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'savingsGoals', id));
  };

  const bankAccounts = accounts.filter(a => a.type === 'bank' || a.type === 'electronic_money');

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md space-y-8">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">貯金目標の管理</h2>

      <form onSubmit={handleSubmit} className="space-y-4 p-6 border-2 border-indigo-100 rounded-lg bg-gray-50 dark:bg-gray-900">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 border-b pb-2 mb-4">
          {editingId ? '貯金目標を編集' : '新規貯金目標を追加'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">名称</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="例: 毎月の貯金"
              required
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">設定方法</label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="fixed">固定金額</option>
              <option value="percentage">収入の割合 (%)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {formData.type === 'fixed' ? (
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">貯金額 (円)</label>
              <input
                type="number"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                min="0"
                placeholder="例: 30000"
                required
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="percentage" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">割合 (1〜100%)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  id="percentage"
                  name="percentage"
                  value={formData.percentage}
                  onChange={handleChange}
                  min="1"
                  max="100"
                  step="0.1"
                  placeholder="例: 20"
                  required
                  className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
                <span className="text-gray-600 dark:text-gray-300 mt-1">%</span>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="linkedAccountId" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">貯金先口座</label>
            <select
              id="linkedAccountId"
              name="linkedAccountId"
              value={formData.linkedAccountId}
              onChange={handleChange}
              required
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">口座を選択してください</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {bankAccounts.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                銀行口座・電子マネーが登録されていません。先に口座を登録してください。
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
        {success && <p className="text-green-500 text-sm font-bold">{success}</p>}

        <div className="flex space-x-4 pt-2">
          <button
            type="submit"
            className={`w-full font-bold py-3 px-4 rounded-md shadow-sm text-white ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {editingId ? '更新する' : '追加する'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 dark:text-gray-100 font-bold py-3 px-4 rounded-md shadow-sm"
            >
              キャンセル
            </button>
          )}
        </div>
      </form>

      <h3 className="text-xl font-bold pt-4 text-gray-800 dark:text-gray-100">登録済み貯金目標</h3>
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">読み込み中...</p>
      ) : (
        <div className="bg-white dark:bg-black border rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {goals.map(goal => {
              const linkedAccount = accounts.find(a => a.id === goal.linkedAccountId);
              return (
                <li key={goal.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg text-gray-800 dark:text-gray-100">🏦 {goal.name}</span>
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-700 dark:text-blue-200">
                          {goal.type === 'fixed' ? '固定額' : '収入割合'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        貯金先: <span className="font-medium text-gray-700 dark:text-gray-200">
                          {linkedAccount ? linkedAccount.name : '(口座未設定)'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-xl text-blue-600">
                        {goal.type === 'fixed'
                          ? `¥${goal.amount.toLocaleString()}`
                          : `${goal.percentage}%`}
                      </span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(goal)}
                          className="px-3 py-1 bg-white dark:bg-black border border-blue-500 text-blue-600 rounded hover:bg-blue-50 text-sm transition-colors"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="px-3 py-1 bg-white dark:bg-black border border-red-500 text-red-600 rounded hover:bg-red-50 text-sm transition-colors"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {goals.length === 0 && (
              <li className="p-8 text-center text-gray-500 dark:text-gray-400">
                貯金目標が設定されていません。
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SavingsGoalSettings;
