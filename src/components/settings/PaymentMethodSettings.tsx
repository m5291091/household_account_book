// /Users/alphabetagamma/work/APP/household_account_book/src/components/settings/PaymentMethodSettings.tsx
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentMethod } from '@/types/PaymentMethod';

const PaymentMethodSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    setLoading(true);
    const paymentMethodsCollectionRef = collection(db, 'users', user.uid, 'paymentMethods');
    const q = query(paymentMethodsCollectionRef, orderBy('name'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const methodsData = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
      }));
      setPaymentMethods(methodsData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('支払い方法の読み込みに失敗しました。');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPaymentMethod.trim() === '' || !user) return;

    try {
      const paymentMethodsCollectionRef = collection(db, 'users', user.uid, 'paymentMethods');
      await addDoc(paymentMethodsCollectionRef, { name: newPaymentMethod.trim() });
      setNewPaymentMethod('');
    } catch (err) {
      console.error(err);
      setError('支払い方法の追加に失敗しました。');
    }
  };

  const handleDeletePaymentMethod = async (id: string) => {
    if (!user) return;
    try {
      const methodDocRef = doc(db, 'users', user.uid, 'paymentMethods', id);
      await deleteDoc(methodDocRef);
    } catch (err) {
      console.error(err);
      setError('支払い方法の削除に失敗しました。');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">支払い方法管理</h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleAddPaymentMethod} className="mb-4 flex">
        <input
          type="text"
          value={newPaymentMethod}
          onChange={(e) => setNewPaymentMethod(e.target.value)}
          placeholder="新しい支払い方法名"
          className="flex-grow shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        />
        <button type="submit" className="ml-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          追加
        </button>
      </form>
      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {paymentMethods.map((method) => (
            <li key={method.id} className="flex justify-between items-center p-2 border rounded">
              <span>{method.name}</span>
              <button
                onClick={() => handleDeletePaymentMethod(method.id)}
                className="text-red-500 hover:text-red-700"
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

export default PaymentMethodSettings;
