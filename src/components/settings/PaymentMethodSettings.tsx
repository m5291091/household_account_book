// /Users/alphabetagamma/work/APP/household_account_book/src/components/settings/PaymentMethodSettings.tsx
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Account } from '@/types/Account';

const PaymentMethodSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    setLoading(true);
    
    // Fetch Payment Methods
    const paymentMethodsCollectionRef = collection(db, 'users', user.uid, 'paymentMethods');
    const q = query(paymentMethodsCollectionRef, orderBy('name'));
    const unsubscribePM = onSnapshot(q, (snapshot) => {
      const methodsData = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        linkedAccountId: doc.data().linkedAccountId
      }));
      setPaymentMethods(methodsData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('支払い方法の読み込みに失敗しました。');
      setLoading(false);
    });

    // Fetch Accounts
    const fetchAccounts = async () => {
      const accountsRef = collection(db, 'users', user.uid, 'accounts');
      const snapshot = await getDocs(accountsRef);
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account)));
    };
    fetchAccounts();

    return () => unsubscribePM();
  }, [user, authLoading]);

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPaymentMethod.trim() === '' || !user) return;

    try {
      const paymentMethodsCollectionRef = collection(db, 'users', user.uid, 'paymentMethods');
      await addDoc(paymentMethodsCollectionRef, { 
        name: newPaymentMethod.trim(),
        linkedAccountId: selectedAccountId || null
      });
      setNewPaymentMethod('');
      setSelectedAccountId('');
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
      <form onSubmit={handleAddPaymentMethod} className="mb-4 flex gap-2">
        <input
          type="text"
          value={newPaymentMethod}
          onChange={(e) => setNewPaymentMethod(e.target.value)}
          placeholder="新しい支払い方法名"
          className="flex-grow shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        />
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        >
          <option value="">紐付ける口座・カード (任意)</option>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.name} ({acc.type === 'credit_card' ? 'カード' : '銀行'})</option>
          ))}
        </select>
        <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          追加
        </button>
      </form>
      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <ul className="space-y-2">
          {paymentMethods.map((method) => {
            const linkedAccount = accounts.find(a => a.id === method.linkedAccountId);
            return (
              <li key={method.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <span className="font-bold mr-2">{method.name}</span>
                  {linkedAccount && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      Link: {linkedAccount.name}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDeletePaymentMethod(method.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  削除
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default PaymentMethodSettings;
