
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useIncomeCategories } from '@/hooks/useIncomeCategories';
import { Income, IncomeFormData } from '@/types/Income';

interface IncomeFormProps {
  incomeToEdit?: Income | null;
  onFormClose?: () => void;
}

const IncomeForm = ({ incomeToEdit, onFormClose }: IncomeFormProps) => {
  const { user } = useAuth();
  const { categories: incomeCategories, loading: categoriesLoading, error: categoriesError } = useIncomeCategories();
  const [formData, setFormData] = useState<IncomeFormData>({ source: '', amount: '', date: new Date().toISOString().split('T')[0], category: '', memo: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (incomeToEdit) {
      setFormData({
        source: incomeToEdit.source,
        amount: incomeToEdit.amount.toString(),
        date: incomeToEdit.date.toDate().toISOString().split('T')[0],
        category: incomeToEdit.category || '',
        memo: incomeToEdit.memo || '',
      });
    }
  }, [incomeToEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setError('ログインが必要です。'); return; }
    if (!formData.source || !formData.amount || !formData.date || !formData.category) { setError('収入源、金額、日付、カテゴリーは必須です。'); return; }

    setLoading(true);
    setError(null);

    try {
      const incomeData = {
        source: formData.source,
        amount: Number(formData.amount),
        date: Timestamp.fromDate(new Date(formData.date)),
        category: formData.category,
        memo: formData.memo || '',
      };

      if (incomeToEdit) {
        // Update existing income
        const incomeRef = doc(db, 'users', user.uid, 'incomes', incomeToEdit.id);
        await updateDoc(incomeRef, incomeData);
      } else {
        // Add new income
        await addDoc(collection(db, 'users', user.uid, 'incomes'), {
          ...incomeData,
          createdAt: serverTimestamp(),
        });
      }
      
      // Reset form and close modal
      setFormData({ source: '', amount: '', date: new Date().toISOString().split('T')[0], category: '', memo: '' });
      if (onFormClose) onFormClose();

    } catch (err) {
      console.error(err);
      setError('収入の保存に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{incomeToEdit ? '収入の編集' : '収入の追加'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700">日付</label>
          <input type="date" name="date" id="date" value={formData.date} onChange={handleChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required />
        </div>
        <div>
          <label htmlFor="source" className="block text-sm font-medium text-gray-700">収入源</label>
          <input type="text" name="source" id="source" value={formData.source} onChange={handleChange} placeholder='給与、ボーナスなど' className="mt-1 w-full p-2 border border-gray-300 rounded-md" required />
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">カテゴリー</label>
          <select name="category" id="category" value={formData.category} onChange={handleChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required disabled={categoriesLoading}>
            <option value="">カテゴリーを選択</option>
            {incomeCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
          </select>
          {categoriesError && <p className="text-red-500 text-sm">{categoriesError}</p>}
        </div>
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">金額</label>
          <input type="number" name="amount" id="amount" value={formData.amount} onChange={handleChange} placeholder='300000' className="mt-1 w-full p-2 border border-ray-300 rounded-md" required />
        </div>
        <div>
          <label htmlFor="memo" className="block text-sm font-medium text-gray-700">メモ</label>
          <textarea name="memo" id="memo" value={formData.memo} onChange={handleChange} rows={3} className="mt-1 w-full p-2 border border-gray-300 rounded-md"></textarea>
        </div>
        
        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex justify-end space-x-4">
          {onFormClose && <button type="button" onClick={onFormClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">キャンセル</button>}
          <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300">
            {loading ? '保存中...' : (incomeToEdit ? '更新' : '追加')}
          </button>
        </div>
      </form>
    </div>
  );
};


export default IncomeForm;
