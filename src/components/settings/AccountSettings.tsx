"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Account, AccountFormData, AccountType } from '@/types/Account';

const AccountSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState<AccountFormData>({
    name: '',
    type: 'bank',
    balance: '',
    closingDay: '',
    paymentDay: '',
    linkedBankAccountId: '',
  });
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const q = query(collection(db, 'users', user.uid, 'accounts'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, authLoading]);

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'bank',
      balance: '',
      closingDay: '',
      paymentDay: '',
      linkedBankAccountId: '',
    });
    setIsEditing(null);
    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formData.name || !formData.balance) {
      setError('名称と残高は必須です。');
      return;
    }

    try {
      const dataToSave = {
        name: formData.name,
        type: formData.type,
        balance: Number(formData.balance),
        closingDay: formData.type === 'credit_card' ? Number(formData.closingDay) || null : null,
        paymentDay: formData.type === 'credit_card' ? Number(formData.paymentDay) || null : null,
        linkedBankAccountId: formData.type === 'credit_card' ? formData.linkedBankAccountId || null : null,
        updatedAt: Timestamp.now(),
      };

      if (isEditing) {
        await updateDoc(doc(db, 'users', user.uid, 'accounts', isEditing), dataToSave);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'accounts'), dataToSave);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      setError('保存に失敗しました。');
    }
  };

  const handleEdit = (account: Account) => {
    setFormData({
      name: account.name,
      type: account.type,
      balance: account.balance.toString(),
      closingDay: account.closingDay?.toString() || '',
      paymentDay: account.paymentDay?.toString() || '',
      linkedBankAccountId: account.linkedBankAccountId || '',
    });
    setIsEditing(account.id);
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('この口座を削除しますか？')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'accounts', id));
  };

  const bankAccounts = accounts.filter(a => a.type === 'bank');

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">口座・資産管理</h2>
      <p className="text-sm text-gray-600 mb-6">銀行口座やクレジットカード情報を登録してください。シミュレーションに使用されます。</p>
      
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="mb-8 space-y-4 border p-4 rounded bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">名称</label>
            <input name="name" value={formData.name} onChange={handleChange} placeholder="例: 三菱UFJ銀行" className="w-full p-2 border rounded" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">種類</label>
            <select name="type" value={formData.type} onChange={handleChange} className="w-full p-2 border rounded">
              <option value="bank">銀行口座</option>
              <option value="credit_card">クレジットカード</option>
              <option value="cash">現金</option>
              <option value="electronic_money">電子マネー</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">現在残高</label>
            <input type="number" name="balance" value={formData.balance} onChange={handleChange} placeholder="円" className="w-full p-2 border rounded" required />
          </div>
        </div>

        {formData.type === 'credit_card' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">締め日</label>
              <select name="closingDay" value={formData.closingDay} onChange={handleChange} className="w-full p-2 border rounded">
                <option value="">選択</option>
                {[...Array(28)].map((_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                <option value="99">末日</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">引き落とし日</label>
              <select name="paymentDay" value={formData.paymentDay} onChange={handleChange} className="w-full p-2 border rounded">
                <option value="">選択</option>
                {[...Array(28)].map((_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                <option value="99">末日</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">引き落とし口座</label>
              <select name="linkedBankAccountId" value={formData.linkedBankAccountId} onChange={handleChange} className="w-full p-2 border rounded">
                <option value="">選択してください</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-2">
          {isEditing && <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-300 rounded">キャンセル</button>}
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            {isEditing ? '更新' : '追加'}
          </button>
        </div>
      </form>

      <ul className="space-y-2">
        {accounts.map(acc => (
          <li key={acc.id} className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
            <div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs px-2 py-1 rounded text-white ${
                  acc.type === 'bank' ? 'bg-blue-500' : 
                  acc.type === 'credit_card' ? 'bg-orange-500' : 
                  'bg-green-500'
                }`}>
                  {acc.type === 'bank' ? '銀行' : acc.type === 'credit_card' ? 'カード' : 'その他'}
                </span>
                <span className="font-bold">{acc.name}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">残高: ¥{acc.balance.toLocaleString()}</p>
              {acc.type === 'credit_card' && (
                <p className="text-xs text-gray-500">
                  {acc.closingDay === 99 ? '末' : acc.closingDay}日締め / {acc.paymentDay === 99 ? '末' : acc.paymentDay}日払い
                  {acc.linkedBankAccountId && ` (-> ${accounts.find(a => a.id === acc.linkedBankAccountId)?.name})`}
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              <button onClick={() => handleEdit(acc)} className="text-blue-600 hover:underline">編集</button>
              <button onClick={() => handleDelete(acc.id)} className="text-red-600 hover:underline">削除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AccountSettings;
