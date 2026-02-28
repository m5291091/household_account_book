import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { Expense } from '@/types/Expense';

export const useExpenses = (userId: string | undefined, startDate: Date, endDate: Date, includeTransfers = false) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setExpenses([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let regularExpenses: Expense[] = [];
    let irregularExpenses: Expense[] = [];
    let regularLoaded = false;
    let irregularLoaded = false;

    const mergeExpenses = () => {
      const regularOnly = regularExpenses.filter(expense => !expense.irregularDate);
      const mergedMap = new Map<string, Expense>();

      [...regularOnly, ...irregularExpenses].forEach(expense => {
        mergedMap.set(expense.id, expense);
      });

      const merged = Array.from(mergedMap.values())
        .filter(e => includeTransfers || !e.isTransfer)
        .sort(
        (a, b) => b.date.toDate().getTime() - a.date.toDate().getTime()
      );

      setExpenses(merged);

      if (regularLoaded && irregularLoaded) {
        setLoading(false);
      }
    };

    const regularQuery = query(
      collection(db, 'users', userId, 'expenses'),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );

    const irregularQuery = query(
      collection(db, 'users', userId, 'expenses'),
      where('irregularDate', '>=', Timestamp.fromDate(startDate)),
      where('irregularDate', '<=', Timestamp.fromDate(endDate)),
      orderBy('irregularDate', 'desc')
    );

    const unsubscribeRegular = onSnapshot(regularQuery, (snapshot) => {
      regularExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      regularLoaded = true;
      mergeExpenses();
    }, (err) => {
      console.error(err);
      setError('支出データの取得に失敗しました。');
      setLoading(false);
    });

    const unsubscribeIrregular = onSnapshot(irregularQuery, (snapshot) => {
      irregularExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      irregularLoaded = true;
      mergeExpenses();
    }, (err) => {
      console.error(err);
      setError('イレギュラー支出データの取得に失敗しました。');
      setLoading(false);
    });

    return () => {
      unsubscribeRegular();
      unsubscribeIrregular();
    };
  }, [userId, startDate, endDate, includeTransfers]);

  return { expenses, loading, error };
};
