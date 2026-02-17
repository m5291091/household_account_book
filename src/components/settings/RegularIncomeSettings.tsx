"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularIncome, RegularIncomeFormData } from '@/types/RegularIncome';
import { format } from 'date-fns';
import Link from 'next/link';

interface IncomeCategory {
  id: string;
  name: string;
}

const RegularIncomeSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularIncome[]>([]);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [formData, setFormData] = useState<RegularIncomeFormData>({
    name: '',
    amount: '',
    category: '',
    frequency: 'months',
    interval: '1',
    nextPaymentDate: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const unsubCategories = onSnapshot(query(collection(db, 'users', user.uid, 'incomeCategories')), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() } as IncomeCategory))));
    const unsubTemplates = onSnapshot(query(collection(db, 'users', user.uid, 'regularIncomes'), orderBy('nextPaymentDate')), s => {
      setTemplates(s.docs.map(d => ({ id: d.id, ...d.data() } as RegularIncome)));
      setLoading(false);
    });
    return () => { unsubCategories(); unsubTemplates(); };
  }, [user, authLoading]);

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      category: '',
      frequency: 'months',
      interval: '1',
      nextPaymentDate: '',
    });
    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name || !formData.amount || !formData.category || !formData.nextPaymentDate || !formData.interval) {
      setError('すべての必須項目を入力してください。');
      return;
    }
    try {
      const nextPaymentDate = new Date(formData.nextPaymentDate);
      const paymentDay = nextPaymentDate.getDate();

      const dataToSave = {
        name: formData.name.trim(),
        amount: Number(formData.amount),
        category: formData.category, // Store category name
        paymentDay: paymentDay,
        frequency: formData.frequency,
        interval: Number(formData.interval),
        nextPaymentDate: Timestamp.fromDate(nextPaymentDate),
      };

      await addDoc(collection(db, 'users', user.uid, 'regularIncomes'), dataToSave);
      resetForm();
    } catch (err) {
      console.error(err);
      setError('テンプレートの追加に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('このテンプレートを削除しますか？')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'regularIncomes', id));
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">定期収入の管理</h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 mb-8 p-4 border rounded-lg">
        <h3 className="text-lg font-semibold">新規テンプレート追加</h3>
        <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="名称 (例: 給料)" required className="w-full p-2 border rounded"/>
        <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="金額" required className="w-full p-2 border rounded"/>
        <select name="category" value={formData.category} onChange={handleChange} required className="w-full p-2 border rounded">
          <option value="">カテゴリー</option>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        
        <div>
          <label htmlFor="nextPaymentDate" className="block text-sm font-medium text-gray-700">初回受取日</label>
          <input type="date" id="nextPaymentDate" name="nextPaymentDate" value={formData.nextPaymentDate} onChange={handleChange} required className="w-full p-2 border rounded"/>
        </div>

        <div className="flex items-center space-x-2">
          <label>間隔:</label>
          <input type="number" name="interval" value={formData.interval} onChange={handleChange} min="1" required className="p-2 border rounded w-20"/>
          <select name="frequency" value={formData.frequency} onChange={handleChange} className="p-2 border rounded">
            <option value="months">ヶ月ごと</option>
            <option value="years">年ごと</option>
          </select>
        </div>
        <div className="flex space-x-2">
          <button type="submit" className="w-full bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
            追加
          </button>
        </div>
      </form>
      <h3 className="text-lg font-semibold mb-4">登録済みテンプレート</h3>
      {loading ? <p>読み込み中...</p> : (
        <ul className="space-y-2">
          {templates.map(t => (
            <li key={t.id} className="p-2 border rounded flex justify-between items-center">
              <div>
                <p className="font-bold">{t.name} - ¥{t.amount.toLocaleString()}</p>
                <p className="text-sm text-gray-600">
                  次回受取日: {t.nextPaymentDate ? format(t.nextPaymentDate.toDate(), 'yyyy/MM/dd') : '未設定'} ({t.interval}{t.frequency === 'years' ? '年' : 'ヶ月'}ごと)
                </p>
              </div>
              <div className="flex space-x-2">
                {/* Edit functionality to be implemented if needed, for now just delete */}
                <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700">削除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RegularIncomeSettings;
