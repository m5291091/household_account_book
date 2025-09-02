"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, Timestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularPayment, RegularPaymentFormData } from '@/types/RegularPayment';
import { Category } from '@/types/Category';
import { PaymentMethod } from '@/types/PaymentMethod';
import { format } from 'date-fns';

const RegularPaymentSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularPayment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [formData, setFormData] = useState<RegularPaymentFormData>({
    name: '',
    amount: '',
    categoryId: '',
    paymentMethodId: '',
    paymentDay: '',
    frequency: 'months',
    interval: '1',
    nextPaymentDate: '',
  });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const unsubCategories = onSnapshot(query(collection(db, 'users', user.uid, 'categories')), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() } as Category))));
    const unsubPaymentMethods = onSnapshot(query(collection(db, 'users', user.uid, 'paymentMethods')), s => setPaymentMethods(s.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod))));
    const unsubTemplates = onSnapshot(query(collection(db, 'users', user.uid, 'regularPayments'), orderBy('nextPaymentDate')), s => {
      setTemplates(s.docs.map(d => ({ id: d.id, ...d.data() } as RegularPayment)));
      setLoading(false);
    });
    return () => { unsubCategories(); unsubPaymentMethods(); unsubTemplates(); };
  }, [user, authLoading]);

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      categoryId: '',
      paymentMethodId: '',
      paymentDay: '',
      frequency: 'months',
      interval: '1',
      nextPaymentDate: '',
    });
    setEditingTemplateId(null);
    setError(null);
  };

  const handleEditClick = (template: RegularPayment) => {
    setEditingTemplateId(template.id);
    setFormData({
      name: template.name,
      amount: template.amount.toString(),
      categoryId: template.categoryId,
      paymentMethodId: template.paymentMethodId,
      paymentDay: template.paymentDay.toString(),
      frequency: template.frequency,
      interval: template.interval.toString(),
      nextPaymentDate: format(template.nextPaymentDate.toDate(), 'yyyy-MM-dd'),
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name || !formData.amount || !formData.categoryId || !formData.paymentMethodId || !formData.nextPaymentDate || !formData.interval) {
      setError('すべての必須項目を入力してください。');
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
      };

      if (editingTemplateId) {
        const templateRef = doc(db, 'users', user.uid, 'regularPayments', editingTemplateId);
        await updateDoc(templateRef, dataToSave);
      } else {
        await addDoc(collection(db, 'users', user.uid, 'regularPayments'), dataToSave);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      setError(editingTemplateId ? 'テンプレートの更新に失敗しました。' : 'テンプレートの追加に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('このテンプレートを削除しますか？')) return;
    if (editingTemplateId === id) {
      resetForm();
    }
    await deleteDoc(doc(db, 'users', user.uid, 'regularPayments', id));
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">定期支出の管理</h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 mb-8 p-4 border rounded-lg">
        <h3 className="text-lg font-semibold">{editingTemplateId ? 'テンプレートを編集' : '新規テンプレート追加'}</h3>
        <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="名称 (例: 家賃)" required className="w-full p-2 border rounded"/>
        <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="基準額" required className="w-full p-2 border rounded"/>
        <select name="categoryId" value={formData.categoryId} onChange={handleChange} required className="w-full p-2 border rounded"><option value="">カテゴリー</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="paymentMethodId" value={formData.paymentMethodId} onChange={handleChange} required className="w-full p-2 border rounded"><option value="">支払い方法</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        
        <div>
          <label htmlFor="nextPaymentDate" className="block text-sm font-medium text-gray-700">次回支払日</label>
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
          <button type="submit" className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            {editingTemplateId ? '更新' : '追加'}
          </button>
          {editingTemplateId && (
            <button type="button" onClick={resetForm} className="w-full bg-gray-300 hover:bg-gray-400 text-black font-bold py-2 px-4 rounded">
              キャンセル
            </button>
          )}
        </div>
      </form>
      <h3 className="text-lg font-semibold mb-4">登録済みテンプレート</h3>
      {loading ? <p>読み込み中...</p> : (
        <ul className="space-y-2">
          {templates.map(t => (
            <li key={t.id} className="p-2 border rounded flex justify-between items-center">
              <div>
                <p className="font-bold">{t.name} - ¥{t.amount.toLocaleString()}</p>
                <p className="text-sm text-gray-600">
                  次回支払日: {t.nextPaymentDate ? format(t.nextPaymentDate.toDate(), 'yyyy/MM/dd') : '未設定'} ({t.interval}{t.frequency === 'years' ? '年' : 'ヶ月'}ごと)
                </p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleEditClick(t)} className="text-blue-500 hover:text-blue-700">編集</button>
                <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700">削除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RegularPaymentSettings;
