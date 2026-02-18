
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface IncomeCategory {
  id: string;
  name: string;
}

const IncomeCategorySettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    setLoading(true);
    const categoriesCollectionRef = collection(db, 'users', user.uid, 'incomeCategories');
    const q = query(categoriesCollectionRef, orderBy('name'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncomeCategory));
      setCategories(categoriesData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('収入カテゴリーの読み込みに失敗しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim() === '' || !user) return;

    try {
      await addDoc(collection(db, 'users', user.uid, 'incomeCategories'), { name: newCategory.trim() });
      setNewCategory('');
      setError(null);
    } catch (err) {
      console.error(err);
      setError('収入カテゴリーの追加に失敗しました。');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'incomeCategories', id));
      setError(null);
    } catch (err) {
      console.error(err);
      setError('収入カテゴリーの削除に失敗しました。');
    }
  };

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">収入カテゴリー管理</h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleAddCategory} className="mb-4 flex">
        <input
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="新しい収入カテゴリー名"
          className="flex-grow shadow appearance-none border rounded py-2 px-3 text-gray-700 dark:text-gray-200 leading-tight focus:outline-none focus:shadow-outline"
        />
        <button type="submit" className="ml-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          追加
        </button>
      </form>
      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {categories.map((category) => (
            <li key={category.id} className="flex justify-between items-center p-2 border rounded">
              <span>{category.name}</span>
              <button
                onClick={() => handleDeleteCategory(category.id)}
                className="text-red-500 hover:text-red-700 text-sm font-semibold"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default IncomeCategorySettings;
