"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, updateDoc, collection, onSnapshot, query, Timestamp, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularPayment, RegularPaymentFormData } from '@/types/RegularPayment';
import { RegularPaymentGroup } from '@/types/RegularPaymentGroup';
import { Category } from '@/types/Category';
import { PaymentMethod } from '@/types/PaymentMethod';
import { format } from 'date-fns';
import Link from 'next/link';

const EditRegularPaymentTemplatePage = () => {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [groups, setGroups] = useState<RegularPaymentGroup[]>([]);
  const [formData, setFormData] = useState<RegularPaymentFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const id = typeof params.id === 'string' ? params.id : '';

  useEffect(() => {
    if (authLoading || !user) return;
    if (!id) {
      setError("IDが見つかりません。");
      setLoading(false);
      return;
    }

    const unsubCategories = onSnapshot(query(collection(db, 'users', user.uid, 'categories')), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() } as Category))));
    const unsubPaymentMethods = onSnapshot(query(collection(db, 'users', user.uid, 'paymentMethods')), s => setPaymentMethods(s.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod))));
    const unsubGroups = onSnapshot(query(collection(db, 'users', user.uid, 'regularPaymentGroups'), orderBy('name')), s => setGroups(s.docs.map(d => ({ id: d.id, ...d.data() } as RegularPaymentGroup))));

    const fetchTemplate = async () => {
      const templateRef = doc(db, 'users', user.uid, 'regularPayments', id);
      const docSnap = await getDoc(templateRef);
      if (docSnap.exists()) {
        const template = docSnap.data() as RegularPayment;
        setFormData({
          name: template.name,
          amount: template.amount.toString(),
          categoryId: template.categoryId,
          paymentMethodId: template.paymentMethodId,
          paymentDay: template.paymentDay.toString(),
          frequency: template.frequency,
          interval: template.interval.toString(),
          nextPaymentDate: format(template.nextPaymentDate.toDate(), 'yyyy-MM-dd'),
          groupId: template.groupId || '',
        });
      } else {
        setError("テンプレートが見つかりませんでした。");
      }
      setLoading(false);
    };

    fetchTemplate();
    return () => { unsubCategories(); unsubPaymentMethods(); unsubGroups(); };
  }, [user, authLoading, id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (formData) {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData) {
      setError('フォームデータがありません。');
      return;
    }
    try {
      const nextPaymentDate = new Date(formData.nextPaymentDate);
      const paymentDay = nextPaymentDate.getDate();

      const dataToSave = {
        name: formData.name.trim(),
        amount: Number(formData.amount),
        categoryId: formData.categoryId,
        paymentMethodId: formData.paymentMethodId,
        paymentDay: paymentDay,
        frequency: formData.frequency,
        interval: Number(formData.interval),
        nextPaymentDate: Timestamp.fromDate(nextPaymentDate),
        groupId: formData.groupId || null,
      };

      const templateRef = doc(db, 'users', user.uid, 'regularPayments', id);
      await updateDoc(templateRef, dataToSave);
      router.push('/settings/expenses');
    } catch (err) {
      console.error(err);
      setError('テンプレートの更新に失敗しました。');
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><p>読み込み中...</p></div>;

  return (
    <div className="">
      <header className="bg-white dark:bg-black shadow-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">定期支出テンプレートを編集</h1>
          <Link href="/settings/expenses" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:text-white">&lt; 設定に戻る</Link>
        </div>
      </header>
      <main className="py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {error && <p className="text-red-500 mb-4">{error}</p>}
          {formData ? (
            <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-black p-6 rounded-lg shadow-md">
              <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="名称 (例: 家賃)" required className="w-full p-2 border rounded"/>
              <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="基準額" required className="w-full p-2 border rounded"/>
              <select name="categoryId" value={formData.categoryId} onChange={handleChange} required className="w-full p-2 border rounded"><option value="">カテゴリー</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select name="paymentMethodId" value={formData.paymentMethodId} onChange={handleChange} required className="w-full p-2 border rounded"><option value="">支払い方法</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              
              <select name="groupId" value={formData.groupId} onChange={handleChange} className="w-full p-2 border rounded">
                <option value="">グループ (なし)</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>

              <div>
                <label htmlFor="nextPaymentDate" className="block text-sm font-medium text-gray-700 dark:text-gray-200">次回支払日</label>
                <input type="date" id="nextPaymentDate" name="nextPaymentDate" value={formData.nextPaymentDate} onChange={handleChange} required className="w-full p-2 border rounded"/>
              </div>
              <div className="flex items-center space-x-2">
                <label>間隔:</label>
                <input type="number" name="interval" value={formData.interval} onChange={handleChange} min="1" required className="p-2 border rounded w-20"/>
                <select name="frequency" value={formData.frequency} onChange={handleChange} className="p-2 border rounded">
                  <option value="months">ヶ月ごと</option>
                  <option value="years">年ごと</option>
                </select>
              </div>
              <div className="flex space-x-2">
                <button type="submit" className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">更新</button>
                <button type="button" onClick={() => router.push('/settings/expenses')} className="w-full bg-gray-300 hover:bg-gray-400 text-black font-bold py-2 px-4 rounded">キャンセル</button>
              </div>
            </form>
          ) : (
            <p>データが見つかりません。</p>
          )}
        </div>
      </main>
    </div>
  );
};

export default EditRegularPaymentTemplatePage;
