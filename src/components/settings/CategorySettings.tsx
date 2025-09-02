"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Category } from '@/types/Category';

const CategorySettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetValues, setBudgetValues] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (authLoading || !user) return;

    setLoading(true);
    const categoriesCollectionRef = collection(db, 'users', user.uid, 'categories');
    const q = query(categoriesCollectionRef, orderBy('name'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(categoriesData);
      
      const initialBudgets: { [key: string]: string } = {};
      categoriesData.forEach(cat => {
        initialBudgets[cat.id] = cat.budget?.toString() || '';
      });
      setBudgetValues(initialBudgets);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('カテゴリーの読み込みに失敗しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim() === '' || !user) return;

    try {
      await addDoc(collection(db, 'users', user.uid, 'categories'), { name: newCategory.trim(), budget: 0 });
      setNewCategory('');
    } catch (err) {
      console.error(err);
      setError('カテゴリーの追加に失敗しました。');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'categories', id));
    } catch (err) {
      console.error(err);
      setError('カテゴリーの削除に失敗しました。');
    }
  };

  const handleBudgetChange = (id: string, value: string) => {
    setBudgetValues(prev => ({ ...prev, [id]: value }));
  };

  const handleBudgetSave = async (id: string) => {
    if (!user) return;
    const budget = parseFloat(budgetValues[id]);
    if (isNaN(budget)) {
      setError('有効な数値を入力してください。');
      return;
    }
    try {
      const categoryDocRef = doc(db, 'users', user.uid, 'categories', id);
      await updateDoc(categoryDocRef, { budget: budget });
      setError(null);
      alert('予算を保存しました。');
    } catch (err) {
      console.error(err);
      setError('予算の保存に失敗しました。');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">カテゴリー管理</h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleAddCategory} className="mb-4 flex">
        <input
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="新しいカテゴリー名"
          className="flex-grow shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        />
        <button type="submit" className="ml-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          追加
        </button>
      </form>
      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <ul className="space-y-3">
          {categories.map((category) => (
            <li key={category.id} className="p-3 border rounded-lg bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="font-medium">{category.name}</span>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  削除
                </button>
              </div>
              <div className="mt-2 flex items-center space-x-2">
                <label className="text-sm">予算:</label>
                <input 
                  type="number"
                  value={budgetValues[category.id] || ''}
                  onChange={e => handleBudgetChange(category.id, e.target.value)}
                  placeholder="月間予算額"
                  className="flex-grow shadow-sm appearance-none border rounded py-1 px-2 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                />
                <button onClick={() => handleBudgetSave(category.id)} className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-sm">
                  保存
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CategorySettings;