// /src/hooks/useCategorySuggestion.ts
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/Expense';

export const useCategorySuggestion = () => {
  const { user } = useAuth();
  const [suggestionMap, setSuggestionMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const buildSuggestionMap = async () => {
      setLoading(true);
      const expensesQuery = query(collection(db, 'users', user.uid, 'expenses'));
      const querySnapshot = await getDocs(expensesQuery);
      const expenses = querySnapshot.docs.map(doc => doc.data() as Expense);

      // Map<storeName, Map<categoryId, count>>
      const frequencyMap = new Map<string, Map<string, number>>();

      expenses.forEach(expense => {
        if (!expense.store || !expense.categoryId) return;
        
        const store = expense.store.trim().toLowerCase();
        const categoryId = expense.categoryId;

        if (!frequencyMap.has(store)) {
          frequencyMap.set(store, new Map());
        }
        const categoryCounts = frequencyMap.get(store)!;
        categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + 1);
      });

      const finalMap = new Map<string, string>();
      frequencyMap.forEach((categoryCounts, store) => {
        let bestCategory = '';
        let maxCount = 0;
        categoryCounts.forEach((count, categoryId) => {
          if (count > maxCount) {
            maxCount = count;
            bestCategory = categoryId;
          }
        });
        if (bestCategory) {
          finalMap.set(store, bestCategory);
        }
      });

      setSuggestionMap(finalMap);
      setLoading(false);
    };

    buildSuggestionMap();
  }, [user]);

  return { suggestionMap, loading };
};
