
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

export interface IncomeCategory {
  id: string;
  name: string;
}

export const useIncomeCategories = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'incomeCategories'),
      orderBy('name')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      try {
        const fetchedCategories = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as IncomeCategory[];
        setCategories(fetchedCategories);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('カテゴリーの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error(err);
      setError('カテゴリーの取得中にエラーが発生しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return { categories, loading, error };
};
