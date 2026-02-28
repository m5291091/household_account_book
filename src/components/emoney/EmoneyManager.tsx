"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import {
  collection, query, onSnapshot, doc,
  orderBy, Timestamp, runTransaction,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Account } from '@/types/Account';
import { AccountTransfer } from '@/types/AccountTransfer';
import { Category } from '@/types/Category';
import { Expense } from '@/types/Expense';
import { format } from 'date-fns';
import Link from 'next/link';

interface SpendingItem {
  key: string;
  date: string;
  amount: string;
  categoryId: string;
  paymentMethodId: string;
  store: string;
  memo: string;
}

const EmoneyManager = () => {
  const { user, loading: authLoading } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Charge form state
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [chargeDate, setChargeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeFromAccountId, setChargeFromAccountId] = useState('');
  const [chargeMemo, setChargeMemo] = useState('');
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeLoading, setChargeLoading] = useState(false);
  const [chargeSpendingItems, setChargeSpendingItems] = useState<SpendingItem[]>([]);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading) setLoading(false);
      return;
    }

    const unsubAccounts = onSnapshot(
      query(collection(db, 'users', user.uid, 'accounts')),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Account));
        setAccounts(all);
        setLoading(false);
      }
    );

    const unsubTransfers = onSnapshot(
      query(collection(db, 'users', user.uid, 'accountTransfers'), orderBy('date', 'desc')),
      (snap) => setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountTransfer)))
    );

    const unsubPM = onSnapshot(
      query(collection(db, 'users', user.uid, 'paymentMethods')),
      (snap) => setPaymentMethods(snap.docs.map(d => ({ id: d.id, name: d.data().name as string })))
    );

    const unsubCategories = onSnapshot(
      query(collection(db, 'users', user.uid, 'categories')),
      (snap) => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)))
    );

    const unsubExpenses = onSnapshot(
      query(collection(db, 'users', user.uid, 'expenses'), orderBy('date', 'desc')),
      (snap) => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)))
    );

    return () => { unsubAccounts(); unsubTransfers(); unsubPM(); unsubCategories(); unsubExpenses(); };
  }, [user, authLoading]);

  const emoneyAccounts = useMemo(
    () => accounts.filter(a => a.type === 'electronic_money'),
    [accounts]
  );

  const sourceAccounts = useMemo(
    () => accounts.filter(a => a.type === 'bank' || a.type === 'cash'),
    [accounts]
  );

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  // Charges for selected account
  const accountTransfers = useMemo(
    () => transfers.filter(t => t.toAccountId === selectedAccountId),
    [transfers, selectedAccountId]
  );

  // Expenses likely paid with this e-money (match payment method name to account name)
  const accountExpenses = useMemo(() => {
    if (!selectedAccount) return [];
    const name = selectedAccount.name.toLowerCase();
    const matchingPmIds = new Set(
      paymentMethods
        .filter(pm => pm.name.toLowerCase().includes(name) || name.includes(pm.name.toLowerCase()))
        .map(pm => pm.id)
    );
    return expenses
      .filter(e => !e.isTransfer && matchingPmIds.has(e.paymentMethodId))
      .slice(0, 50);
  }, [expenses, selectedAccount, paymentMethods]);

  const totalCharged = useMemo(() => accountTransfers.reduce((s, t) => s + t.amount, 0), [accountTransfers]);
  const totalSpent = useMemo(() => accountExpenses.reduce((s, e) => s + e.amount, 0), [accountExpenses]);

  // Default payment method for spending items (matched by account name)
  const defaultPmId = useMemo(() => {
    if (!selectedAccount) return '';
    const name = selectedAccount.name.toLowerCase();
    return paymentMethods.find(
      pm => pm.name.toLowerCase().includes(name) || name.includes(pm.name.toLowerCase())
    )?.id ?? '';
  }, [selectedAccount, paymentMethods]);

  const addSpendingItem = () => {
    setChargeSpendingItems(prev => [...prev, {
      key: Date.now().toString(),
      date: chargeDate,
      amount: '',
      categoryId: '',
      paymentMethodId: defaultPmId,
      store: '',
      memo: '',
    }]);
  };

  const removeSpendingItem = (key: string) => {
    setChargeSpendingItems(prev => prev.filter(i => i.key !== key));
  };

  const updateSpendingItem = (key: string, field: keyof Omit<SpendingItem, 'key'>, value: string) => {
    setChargeSpendingItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i));
  };

  const handleChargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAccountId) return;
    const amount = Number(chargeAmount);
    if (!amount || amount <= 0) { setChargeError('金額を正しく入力してください。'); return; }
    setChargeLoading(true);
    setChargeError(null);
    try {
      await runTransaction(db, async (tx) => {
        const transferRef = doc(collection(db, 'users', user.uid, 'accountTransfers'));
        tx.set(transferRef, {
          date: Timestamp.fromDate(new Date(chargeDate)),
          amount,
          toAccountId: selectedAccountId,
          fromAccountId: chargeFromAccountId || null,
          memo: chargeMemo.trim() || null,
        });

        // Update e-money balance
        const toRef = doc(db, 'users', user.uid, 'accounts', selectedAccountId);
        const toSnap = await tx.get(toRef);
        if (toSnap.exists()) {
          tx.update(toRef, { balance: (toSnap.data().balance ?? 0) + amount });
        }

        // Deduct from source account
        if (chargeFromAccountId) {
          const fromRef = doc(db, 'users', user.uid, 'accounts', chargeFromAccountId);
          const fromSnap = await tx.get(fromRef);
          if (fromSnap.exists()) {
            tx.update(fromRef, { balance: (fromSnap.data().balance ?? 0) - amount });
          }
        }

        // Create expense records for each spending item
        for (const item of chargeSpendingItems) {
          const itemAmount = Number(item.amount);
          if (!item.categoryId || !itemAmount || itemAmount <= 0 || !item.paymentMethodId) continue;
          const expenseRef = doc(collection(db, 'users', user.uid, 'expenses'));
          tx.set(expenseRef, {
            date: Timestamp.fromDate(new Date(item.date)),
            amount: itemAmount,
            categoryId: item.categoryId,
            paymentMethodId: item.paymentMethodId,
            store: item.store.trim() || '',
            memo: item.memo.trim() || '',
            isTransfer: false,
            isChecked: false,
            receiptUrl: '',
            irregularDate: null,
          });
        }
      });

      setChargeAmount('');
      setChargeMemo('');
      setChargeDate(format(new Date(), 'yyyy-MM-dd'));
      setChargeSpendingItems([]);
      setShowChargeForm(false);
    } catch (err) {
      console.error(err);
      setChargeError('チャージの記録に失敗しました。');
    } finally {
      setChargeLoading(false);
    }
  };

  const handleUndoTransfer = async (transfer: AccountTransfer) => {
    if (!user || !confirm(`このチャージ（¥${transfer.amount.toLocaleString()}）を取り消しますか？`)) return;
    try {
      await runTransaction(db, async (tx) => {
        const toRef = doc(db, 'users', user.uid, 'accounts', transfer.toAccountId);
        const toSnap = await tx.get(toRef);
        if (toSnap.exists()) {
          tx.update(toRef, { balance: (toSnap.data().balance ?? 0) - transfer.amount });
        }
        if (transfer.fromAccountId) {
          const fromRef = doc(db, 'users', user.uid, 'accounts', transfer.fromAccountId);
          const fromSnap = await tx.get(fromRef);
          if (fromSnap.exists()) {
            tx.update(fromRef, { balance: (fromSnap.data().balance ?? 0) + transfer.amount });
          }
        }
        tx.delete(doc(db, 'users', user.uid, 'accountTransfers', transfer.id));
      });
    } catch (err) {
      console.error(err);
      alert('取り消しに失敗しました。');
    }
  };

  if (loading || authLoading) {
    return <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-500"></div></div>;
  }

  if (!user) {
    return <div className="text-center mt-20"><p>ログインしてください</p></div>;
  }

  return (
    <div className="space-y-6">

      {/* 概要説明 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300 space-y-1">
        <p className="font-bold">💡 電子マネーの管理フロー</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li><strong>チャージを記録</strong>（振替）→ 電子マネー残高が増加。支出集計には含まれません。</li>
          <li>実際の買い物は通常の<strong>「支出を記録」</strong>で食費・交通費など正しいカテゴリーで記録。</li>
          <li>既存の「チャージ」支出は支出編集で <strong>「振替として記録」</strong> にチェックすると集計から除外できます。</li>
        </ol>
      </div>

      {emoneyAccounts.length === 0 ? (
        <div className="bg-white dark:bg-black p-8 rounded-lg shadow-md text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">電子マネー口座が登録されていません。</p>
          <Link href="/settings" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-bold">
            設定で口座を追加する
          </Link>
        </div>
      ) : (
        <>
          {/* 口座タブ */}
          <div className="flex flex-wrap gap-2">
            {emoneyAccounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => { setSelectedAccountId(acc.id); setShowChargeForm(false); setChargeSpendingItems([]); }}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  selectedAccountId === acc.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-black text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                }`}
              >
                💳 {acc.name}
              </button>
            ))}
          </div>

          {selectedAccount ? (
            <div className="space-y-6">
              {/* 残高カード */}
              <div className="bg-white dark:bg-black rounded-xl shadow-md p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">現在の残高</p>
                  <p className="text-4xl font-bold text-indigo-600">¥{selectedAccount.balance.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    累計チャージ: ¥{totalCharged.toLocaleString()}　／　累計利用（推定）: ¥{totalSpent.toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => setShowChargeForm(v => !v)}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded text-sm"
                  >
                    ＋ チャージを記録
                  </button>
                  <Link
                    href="/transactions/expense"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-sm"
                  >
                    支出を記録する
                  </Link>
                </div>
              </div>

              {/* チャージ記録フォーム */}
              {showChargeForm && (
                <form
                  onSubmit={handleChargeSubmit}
                  className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg p-5 space-y-4"
                >
                  <h3 className="font-bold text-green-800 dark:text-green-300">
                    {selectedAccount.name} へのチャージを記録
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">チャージ日</label>
                      <input
                        type="date"
                        value={chargeDate}
                        onChange={e => setChargeDate(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">チャージ金額</label>
                      <input
                        type="number"
                        value={chargeAmount}
                        onChange={e => setChargeAmount(e.target.value)}
                        placeholder="3000"
                        min={1}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">引き落とし元口座（任意）</label>
                      <select
                        value={chargeFromAccountId}
                        onChange={e => setChargeFromAccountId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                      >
                        <option value="">(記録しない)</option>
                        {sourceAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name}（¥{a.balance.toLocaleString()}）</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">メモ（任意）</label>
                      <input
                        type="text"
                        value={chargeMemo}
                        onChange={e => setChargeMemo(e.target.value)}
                        placeholder="コンビニATMなど"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                      />
                    </div>
                  </div>

                  {/* 実際の支出セクション */}
                  <div className="border border-indigo-200 dark:border-indigo-700 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                        💰 実際の支出も記録する（任意）
                      </p>
                      <button
                        type="button"
                        onClick={addSpendingItem}
                        className="text-xs px-3 py-1 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded font-semibold"
                      >
                        ＋ 支出を追加
                      </button>
                    </div>
                    {chargeSpendingItems.length === 0 && (
                      <p className="text-xs text-gray-400">「＋ 支出を追加」で食費・交通費などを記録できます。</p>
                    )}
                    {chargeSpendingItems.map((item, idx) => (
                      <div key={item.key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">支出 {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeSpendingItem(item.key)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >削除</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">日付</label>
                            <input
                              type="date"
                              value={item.date}
                              onChange={e => updateSpendingItem(item.key, 'date', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">金額 <span className="text-red-500">*</span></label>
                            <input
                              type="number"
                              value={item.amount}
                              onChange={e => updateSpendingItem(item.key, 'amount', e.target.value)}
                              placeholder="1500"
                              min={1}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">カテゴリー <span className="text-red-500">*</span></label>
                            <select
                              value={item.categoryId}
                              onChange={e => updateSpendingItem(item.key, 'categoryId', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                            >
                              <option value="">選択してください</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">支払い方法 <span className="text-red-500">*</span></label>
                            <select
                              value={item.paymentMethodId}
                              onChange={e => updateSpendingItem(item.key, 'paymentMethodId', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                            >
                              <option value="">選択してください</option>
                              {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">店名（任意）</label>
                            <input
                              type="text"
                              value={item.store}
                              onChange={e => updateSpendingItem(item.key, 'store', e.target.value)}
                              placeholder="コンビニなど"
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">メモ（任意）</label>
                            <input
                              type="text"
                              value={item.memo}
                              onChange={e => updateSpendingItem(item.key, 'memo', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-black text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {chargeError && <p className="text-red-500 text-sm">{chargeError}</p>}
                  <div className="flex gap-3">                    <button
                      type="submit"
                      disabled={chargeLoading}
                      className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold rounded text-sm"
                    >
                      {chargeLoading ? '記録中...' : '記録する'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowChargeForm(false); setChargeSpendingItems([]); }}
                      className="px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm"
                    >
                      キャンセル
                    </button>
                  </div>
                </form>
              )}

              {/* 2カラム: チャージ履歴 / 利用履歴 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* チャージ履歴 */}
                <div className="bg-white dark:bg-black rounded-lg shadow-md p-5">
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-4">チャージ履歴</h3>
                  {accountTransfers.length === 0 ? (
                    <p className="text-gray-400 text-sm">チャージ記録がありません。</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {accountTransfers.map(t => {
                        const fromAcc = accounts.find(a => a.id === t.fromAccountId);
                        return (
                          <li key={t.id} className="py-3 flex justify-between items-start gap-2">
                            <div>
                              <p className="text-sm font-semibold text-green-600">＋¥{t.amount.toLocaleString()}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {format(t.date.toDate(), 'yyyy年MM月dd日')}
                                {fromAcc && <span> · {fromAcc.name}から</span>}
                              </p>
                              {t.memo && <p className="text-xs text-gray-400 mt-0.5">{t.memo}</p>}
                            </div>
                            <button
                              onClick={() => handleUndoTransfer(t)}
                              className="text-xs text-red-400 hover:text-red-600 flex-shrink-0"
                            >取消</button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* 利用履歴（推定） */}
                <div className="bg-white dark:bg-black rounded-lg shadow-md p-5">
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-1">利用履歴（推定）</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    支払い方法の名称が「{selectedAccount.name}」に関連する支出を表示しています。
                  </p>
                  {accountExpenses.length === 0 ? (
                    <p className="text-gray-400 text-sm">
                      該当する支出が見つかりません。<br />
                      支出を記録する際の支払い方法に「{selectedAccount.name}」を含む名称を設定してください。
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {accountExpenses.map(e => (
                        <li key={e.id} className="py-2.5 flex justify-between items-start gap-2">
                          <div>
                            <p className="text-sm font-semibold text-red-500">−¥{e.amount.toLocaleString()}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {format(e.date.toDate(), 'yyyy年MM月dd日')}
                              {e.store && <span> · {e.store}</span>}
                            </p>
                          </div>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 dark:text-gray-400 flex-shrink-0">
                            カテゴリーID: {e.categoryId}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-12">上のタブから口座を選択してください。</p>
          )}
        </>
      )}
    </div>
  );
};

export default EmoneyManager;
