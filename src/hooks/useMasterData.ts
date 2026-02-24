import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { Category } from '@/types/Category';
import { PaymentMethod } from '@/types/PaymentMethod';

export const useMasterData = (userId: string | undefined) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<(PaymentMethod & { order?: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    const unsubCategories = onSnapshot(query(collection(db, 'users', userId, 'categories'), orderBy('name')), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });

    const unsubPaymentMethods = onSnapshot(query(collection(db, 'users', userId, 'paymentMethods')), (snap) => {
      const pms = snap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod & { order?: number }));
      pms.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
      setPaymentMethods(pms);
      setLoading(false);
    });

    return () => {
      unsubCategories();
      unsubPaymentMethods();
    };
  }, [userId]);

  return { categories, paymentMethods, loading };
};
