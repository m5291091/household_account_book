// /Users/alphabetagamma/work/APP/household_account_book/src/components/settings/PaymentMethodSettings.tsx
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Account, AccountFormData, AccountType } from '@/types/Account';

const PaymentMethodSettings = () => {
  const { user, loading: authLoading } = useAuth();
  
  // Payment Methods State
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  
  // Accounts State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountForm, setAccountForm] = useState<AccountFormData>({
    name: '',
    type: 'bank',
    balance: '',
    closingDay: '',
    paymentDay: '',
    linkedBankAccountId: '',
  });
  const [isEditingAccount, setIsEditingAccount] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    
    // Fetch Payment Methods
    const pmQ = query(collection(db, 'users', user.uid, 'paymentMethods'), orderBy('name'));
    const unsubPM = onSnapshot(pmQ, (snapshot) => {
      const methodsData = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        linkedAccountId: doc.data().linkedAccountId
      }));
      setPaymentMethods(methodsData);
    });

    // Fetch Accounts
    const accQ = query(collection(db, 'users', user.uid, 'accounts'), orderBy('name'));
    const unsubAcc = onSnapshot(accQ, (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account)));
      setLoading(false);
    });

    return () => {
      unsubPM();
      unsubAcc();
    };
  }, [user, authLoading]);

  // Account Handlers
  const resetAccountForm = () => {
    setAccountForm({
      name: '',
      type: 'bank',
      balance: '',
      closingDay: '',
      paymentDay: '',
      linkedBankAccountId: '',
    });
    setIsEditingAccount(null);
    setError(null);
  };

  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setAccountForm({ ...accountForm, [e.target.name]: e.target.value });
  };

  const handleSubmitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Validate: Balance is required only if NOT credit card
    if (!accountForm.name || (accountForm.type !== 'credit_card' && !accountForm.balance)) {
      setError('名称と残高（クレジットカード以外）は必須です。');
      return;
    }

    try {
      const dataToSave = {
        name: accountForm.name,
        type: accountForm.type,
        balance: accountForm.type === 'credit_card' ? 0 : Number(accountForm.balance), // Default 0 balance/usage for CC if not set
        closingDay: accountForm.type === 'credit_card' ? Number(accountForm.closingDay) || null : null,
        paymentDay: accountForm.type === 'credit_card' ? Number(accountForm.paymentDay) || null : null,
        linkedBankAccountId: accountForm.type === 'credit_card' ? accountForm.linkedBankAccountId || null : null,
        updatedAt: Timestamp.now(),
      };

      if (isEditingAccount) {
        await updateDoc(doc(db, 'users', user.uid, 'accounts', isEditingAccount), dataToSave);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'accounts'), dataToSave);
      }
      resetAccountForm();
    } catch (err) {
      console.error(err);
      setError('口座の保存に失敗しました。');
    }
  };

  const handleEditAccount = (account: Account) => {
    setAccountForm({
      name: account.name,
      type: account.type,
      balance: account.balance.toString(),
      closingDay: account.closingDay?.toString() || '',
      paymentDay: account.paymentDay?.toString() || '',
      linkedBankAccountId: account.linkedBankAccountId || '',
    });
    setIsEditingAccount(account.id);
  };

  const handleDeleteAccount = async (id: string) => {
    if (!user || !confirm('この口座を削除しますか？紐付いている支払い方法がある場合、リンクが解除されます。')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'accounts', id));
  };

  // Payment Method Handlers
  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPaymentMethod.trim() === '' || !user) return;

    try {
      await addDoc(collection(db, 'users', user.uid, 'paymentMethods'), { 
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
      await deleteDoc(doc(db, 'users', user.uid, 'paymentMethods', id));
    } catch (err) {
      console.error(err);
      setError('支払い方法の削除に失敗しました。');
    }
  };

  const bankAccounts = accounts.filter(a => a.type === 'bank');

  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-10">
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {/* Account Settings Section */}
      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">口座・カード設定</h2>
        <p className="text-sm text-gray-600 mb-4">資産シミュレーションの元となる口座やクレジットカードを登録します。</p>
        
        <form onSubmit={handleSubmitAccount} className="mb-6 space-y-4 border p-4 rounded bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">名称</label>
              <input name="name" value={accountForm.name} onChange={handleAccountChange} placeholder="例: 三菱UFJ銀行, 楽天カード" className="w-full p-2 border rounded" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">種類</label>
              <select name="type" value={accountForm.type} onChange={handleAccountChange} className="w-full p-2 border rounded">
                <option value="bank">銀行口座</option>
                <option value="credit_card">クレジットカード</option>
                <option value="cash">現金</option>
                <option value="electronic_money">電子マネー</option>
              </select>
            </div>
            {accountForm.type !== 'credit_card' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">現在残高</label>
                <input type="number" name="balance" value={accountForm.balance} onChange={handleAccountChange} placeholder="円" className="w-full p-2 border rounded" required />
              </div>
            )}
          </div>

          {accountForm.type === 'credit_card' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4 mt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">締め日</label>
                <select name="closingDay" value={accountForm.closingDay} onChange={handleAccountChange} className="w-full p-2 border rounded">
                  <option value="">選択</option>
                  {[...Array(28)].map((_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                  <option value="99">末日</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">引き落とし日</label>
                <select name="paymentDay" value={accountForm.paymentDay} onChange={handleAccountChange} className="w-full p-2 border rounded">
                  <option value="">選択</option>
                  {[...Array(28)].map((_, i) => <option key={i+1} value={i+1}>{i+1}日</option>)}
                  <option value="99">末日</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">引き落とし口座</label>
                <select name="linkedBankAccountId" value={accountForm.linkedBankAccountId} onChange={handleAccountChange} className="w-full p-2 border rounded">
                  <option value="">選択してください</option>
                  {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            {isEditingAccount && <button type="button" onClick={resetAccountForm} className="px-4 py-2 bg-gray-300 rounded">キャンセル</button>}
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              {isEditingAccount ? '更新' : '追加'}
            </button>
          </div>
        </form>

        <ul className="space-y-2 max-h-60 overflow-y-auto">
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
                {acc.type !== 'credit_card' && <p className="text-sm text-gray-600 mt-1">残高: ¥{acc.balance.toLocaleString()}</p>}
                {acc.type === 'credit_card' && (
                  <p className="text-xs text-gray-500">
                    {acc.closingDay === 99 ? '末' : acc.closingDay}日締め / {acc.paymentDay === 99 ? '末' : acc.paymentDay}日払い
                    {acc.linkedBankAccountId && ` (-> ${accounts.find(a => a.id === acc.linkedBankAccountId)?.name})`}
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleEditAccount(acc)} className="text-blue-600 hover:underline">編集</button>
                <button onClick={() => handleDeleteAccount(acc.id)} className="text-red-600 hover:underline">削除</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Payment Method Settings Section */}
      <section>
        <h2 className="text-xl font-bold mb-4 border-b pb-2">支払い方法の紐付け</h2>
        <p className="text-sm text-gray-600 mb-4">記録時に選択する「支払い方法」と、上記で設定した「口座・カード」を紐付けます。</p>

        <form onSubmit={handleAddPaymentMethod} className="mb-6 flex gap-2">
          <input
            type="text"
            value={newPaymentMethod}
            onChange={(e) => setNewPaymentMethod(e.target.value)}
            placeholder="新しい支払い方法名 (例: メインカード)"
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
                    {linkedAccount ? (
                      <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded border border-green-200">
                        Link: {linkedAccount.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                        未連携
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
      </section>
    </div>
  );
};

export default PaymentMethodSettings;
