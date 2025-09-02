
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Income } from '@/types/Income';

interface CategoryData {
  name: string;
  value: number;
}

export const useIncomeByCategory = (startDate: Date, endDate: Date) => {
  const { user } = useAuth();
  const [data, setData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'incomes'),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate))
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      try {
        const incomes = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Income[];
        
        const categoryTotals = incomes.reduce((acc, income) => {
          const category = income.category || '未分類';
          acc[category] = (acc[category] || 0) + income.amount;
          return acc;
        }, {} as { [key: string]: number });

        const formattedData = Object.entries(categoryTotals).map(([name, value]) => ({
          name,
          value,
        }));

        setData(formattedData);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('データの集計に失敗しました。');
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error(err);
      setError('データの取得に失敗しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, startDate, endDate]);

  return { data, loading, error };
};
