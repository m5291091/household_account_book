"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, Timestamp, writeBatch, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularIncome, RegularIncomeFormData } from '@/types/RegularIncome';
import { format } from 'date-fns';
import Link from 'next/link';
import AddItemModal from '@/components/ui/AddItemModal';
import { Account } from '@/types/Account';

interface IncomeCategory {
  id: string;
  name: string;
}

const RegularIncomeSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularIncome[]>([]);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formData, setFormData] = useState<RegularIncomeFormData>({
    name: '',
    amount: '',
    totalTaxableAmount: '',
    category: '',
    frequency: 'months',
    interval: '1',
    nextPaymentDate: '',
    linkedBankAccountId: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Edit State
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Bulk Action State
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<string>(''); // 'category', 'date', 'delete'
  const [bulkValue, setBulkValue] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // UI State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const unsubCategories = onSnapshot(query(collection(db, 'users', user.uid, 'incomeCategories')), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() } as IncomeCategory))));
    const unsubAccounts = onSnapshot(query(collection(db, 'users', user.uid, 'accounts')), s => setAccounts(s.docs.map(d => ({ id: d.id, ...d.data() } as Account))));
    const unsubTemplates = onSnapshot(query(collection(db, 'users', user.uid, 'regularIncomes'), orderBy('nextPaymentDate')), s => {
      setTemplates(s.docs.map(d => ({ id: d.id, ...d.data() } as RegularIncome)));
      setLoading(false);
    });
    return () => { unsubCategories(); unsubAccounts(); unsubTemplates(); };
  }, [user, authLoading]);

  const resetForm = () => {
    setFormData({
      name: '',
      amount: '',
      totalTaxableAmount: '',
      category: '',
      frequency: 'months',
      interval: '1',
      nextPaymentDate: '',
      linkedBankAccountId: '',
    });
    setEditingTemplateId(null);
    setError(null);
    setSuccess(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEdit = (template: RegularIncome) => {
    setFormData({
      name: template.name,
      amount: String(template.amount),
      totalTaxableAmount: String(template.totalTaxableAmount || ''),
      category: template.category,
      frequency: template.frequency,
      interval: String(template.interval),
      nextPaymentDate: template.nextPaymentDate ? format(template.nextPaymentDate.toDate(), 'yyyy-MM-dd') : '',
      linkedBankAccountId: template.linkedBankAccountId || '',
    });
    setEditingTemplateId(template.id);
    setSuccess(null);
    setError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const handleAddCategory = async (name: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'incomeCategories'), { name });
      setFormData(prev => ({ ...prev, category: name }));
    } catch (err) {
      console.error("Failed to add category:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name || !formData.amount || !formData.category || !formData.nextPaymentDate || !formData.interval) {
      setError('すべての必須項目を入力してください。');
      return;
    }
    try {
      const nextPaymentDate = new Date(formData.nextPaymentDate);
      const paymentDay = nextPaymentDate.getDate();

      const dataToSave = {
        name: formData.name.trim(),
        amount: Number(formData.amount),
        totalTaxableAmount: Number(formData.totalTaxableAmount) || 0,
        category: formData.category, 
        paymentDay: paymentDay,
        frequency: formData.frequency as 'months' | 'years',
        interval: Number(formData.interval),
        nextPaymentDate: Timestamp.fromDate(nextPaymentDate),
        linkedBankAccountId: formData.linkedBankAccountId || null,
      };

      if (editingTemplateId) {
        await updateDoc(doc(db, 'users', user.uid, 'regularIncomes', editingTemplateId), dataToSave);
        setSuccess('テンプレートを更新しました。');
      } else {
        await addDoc(collection(db, 'users', user.uid, 'regularIncomes'), dataToSave);
        setSuccess('テンプレートを追加しました。');
      }
      resetForm();
    } catch (err) {
      console.error(err);
      setError(editingTemplateId ? '更新に失敗しました。' : '追加に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('このテンプレートを削除しますか？')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'regularIncomes', id));
  };

  // Bulk Actions
  const handleToggleSelect = (id: string) => {
    setSelectedTemplateIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const executeBulkAction = async () => {
    if (!user || selectedTemplateIds.length === 0) return;
    if (bulkAction !== 'delete' && !bulkValue) return;

    if (bulkAction === 'delete' && !confirm(`${selectedTemplateIds.length}件のテンプレートを削除しますか？`)) return;

    setIsBulkUpdating(true);
    try {
      const batch = writeBatch(db);
      
      selectedTemplateIds.forEach(id => {
        const ref = doc(db, 'users', user.uid, 'regularIncomes', id);
        
        switch (bulkAction) {
          case 'delete':
            batch.delete(ref);
            break;
          case 'category':
            batch.update(ref, { category: bulkValue });
            break;
          case 'date':
            const date = new Date(bulkValue);
            batch.update(ref, { 
              nextPaymentDate: Timestamp.fromDate(date),
              paymentDay: date.getDate()
            });
            break;
          case 'tax':
            batch.update(ref, { totalTaxableAmount: Number(bulkValue) });
            break;
        }
      });
      
      await batch.commit();
      setSelectedTemplateIds([]);
      setBulkAction('');
      setBulkValue('');
      alert('一括更新が完了しました。');
    } catch (err) {
      console.error(err);
      setError('一括更新に失敗しました。');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md space-y-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">定期収入の管理</h2>
      
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-6 border-2 border-indigo-100 rounded-lg bg-gray-50 dark:bg-gray-900">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 border-b pb-2 mb-4">
          {editingTemplateId ? 'テンプレートを編集' : '新規テンプレート追加'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div>
             <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">名称 (収入源)</label>
             <input 
               type="text" 
               name="name" 
               id="name"
               value={formData.name} 
               onChange={handleChange} 
               placeholder="例: 給料" 
               required 
               className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
             />
           </div>
           <div>
             <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">差引支給額</label>
             <input 
               type="number" 
               name="amount" 
               id="amount"
               value={formData.amount} 
               onChange={handleChange} 
               placeholder="手取り額" 
               required 
               className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
             />
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div>
             <label htmlFor="totalTaxableAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">課税合計</label>
             <input 
               type="number" 
               name="totalTaxableAmount" 
               id="totalTaxableAmount"
               value={formData.totalTaxableAmount} 
               onChange={handleChange} 
               placeholder="所得税・住民税など" 
               className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
             />
           </div>
           <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">カテゴリー</label>
            <div className="flex gap-2">
              <select 
                name="category" 
                id="category"
                value={formData.category} 
                onChange={handleChange} 
                required 
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">カテゴリーを選択</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <button 
                type="button" 
                onClick={() => setIsCategoryModalOpen(true)}
                className="mt-1 px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-700 dark:text-gray-200 font-bold"
              >
                +
              </button>
            </div>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="nextPaymentDate" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">次回受取日</label>
            <input 
              type="date" 
              id="nextPaymentDate" 
              name="nextPaymentDate" 
              value={formData.nextPaymentDate} 
              onChange={handleChange} 
              required 
              className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">間隔</label>
            <div className="flex items-center space-x-2">
                <input 
                type="number" 
                name="interval" 
                value={formData.interval} 
                onChange={handleChange} 
                min="1" 
                required 
                className="mt-1 block w-24 px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
                <select 
                name="frequency" 
                value={formData.frequency} 
                onChange={handleChange} 
                className="mt-1 block px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                <option value="months">ヶ月ごと</option>
                <option value="years">年ごと</option>
                </select>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="linkedBankAccountId" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">入金先口座 (任意)</label>
          <select 
            id="linkedBankAccountId"
            name="linkedBankAccountId" 
            value={formData.linkedBankAccountId} 
            onChange={handleChange} 
            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">(未設定)</option>
            {accounts.filter(a => a.type === 'bank' || a.type === 'electronic_money').map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
        {success && <p className="text-green-500 text-sm font-bold">{success}</p>}

        <div className="flex space-x-4 pt-2">
          <button 
            type="submit" 
            className={`w-full font-bold py-3 px-4 rounded-md shadow-sm text-white ${editingTemplateId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {editingTemplateId ? '更新する' : '追加する'}
          </button>
          {editingTemplateId && (
            <button 
              type="button" 
              onClick={handleCancelEdit} 
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 dark:text-gray-100 font-bold py-3 px-4 rounded-md shadow-sm"
            >
              キャンセル
            </button>
          )}
        </div>
      </form>

      {/* Bulk Action Bar */}
      {selectedTemplateIds.length > 0 && (
        <div className="sticky top-4 z-10 bg-indigo-50 border border-indigo-200 p-4 rounded-lg shadow-sm animate-fade-in space-y-3">
          <div className="flex justify-between items-center">
             <div className="font-bold text-indigo-800">{selectedTemplateIds.length}件 選択中</div>
             <button onClick={() => setSelectedTemplateIds([])} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200">選択解除</button>
          </div>
          
          <div className="flex flex-col md:flex-row gap-2">
            <select 
              value={bulkAction} 
              onChange={(e) => { setBulkAction(e.target.value); setBulkValue(''); }} 
              className="p-2 border rounded"
            >
              <option value="">操作を選択...</option>
              <option value="category">カテゴリー変更</option>
              <option value="date">次回受取日変更</option>
              <option value="tax">課税合計変更</option>
              <option value="delete">削除</option>
            </select>

            {bulkAction === 'category' && (
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="p-2 border rounded flex-grow">
                    <option value="">カテゴリーを選択...</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
            )}
            {bulkAction === 'date' && (
                <input type="date" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="p-2 border rounded flex-grow" />
            )}
            {bulkAction === 'tax' && (
                <input type="number" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="課税合計" className="p-2 border rounded flex-grow" />
            )}
            
            <button 
              onClick={executeBulkAction} 
              disabled={isBulkUpdating || (!bulkValue && bulkAction !== 'delete') || !bulkAction}
              className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:bg-indigo-300 whitespace-nowrap"
            >
              {isBulkUpdating ? '処理中...' : bulkAction === 'delete' ? '一括削除' : '適用'}
            </button>
          </div>
        </div>
      )}

      <h3 className="text-xl font-bold pt-4 text-gray-800 dark:text-gray-100">登録済みテンプレート一覧</h3>
      {loading ? <p>読み込み中...</p> : (
        <div className="bg-white dark:bg-black border rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {templates.map(t => (
              <li key={t.id} className={`p-4 hover:bg-gray-50 dark:bg-gray-900 transition-colors ${selectedTemplateIds.includes(t.id) ? 'bg-indigo-50' : ''}`}>
                <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={selectedTemplateIds.includes(t.id)} 
                      onChange={() => handleToggleSelect(t.id)}
                      className="mr-4 h-5 w-5 text-indigo-600 rounded cursor-pointer"
                    />
                    <div className="flex-grow flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg text-gray-800 dark:text-gray-100">{t.name}</span>
                          <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-300">{t.category}</span>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            次回: <span className="font-medium text-gray-700 dark:text-gray-200">{t.nextPaymentDate ? format(t.nextPaymentDate.toDate(), 'yyyy/MM/dd') : '未設定'}</span>
                            <span className="mx-2 text-gray-300">|</span>
                            間隔: {t.interval}{t.frequency === 'years' ? '年' : 'ヶ月'}ごと
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-xl text-green-600">¥{t.amount.toLocaleString()}</span>
                        <div className="flex space-x-2">
                            <button 
                                onClick={() => handleEdit(t)} 
                                className="px-3 py-1 bg-white dark:bg-black border border-blue-500 text-blue-600 rounded hover:bg-blue-50 text-sm transition-colors"
                            >
                                編集
                            </button>
                            <button 
                                onClick={() => handleDelete(t.id)} 
                                className="px-3 py-1 bg-white dark:bg-black border border-red-500 text-red-600 rounded hover:bg-red-50 text-sm transition-colors"
                            >
                                削除
                            </button>
                        </div>
                      </div>
                    </div>
                </div>
              </li>
            ))}
            {templates.length === 0 && (
                <li className="p-8 text-center text-gray-500 dark:text-gray-400">テンプレートがありません。</li>
            )}
          </ul>
        </div>
      )}

      <AddItemModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onAdd={handleAddCategory}
        title="収入カテゴリーを追加"
        placeholder="カテゴリー名 (例: 給料)"
      />
    </div>
  );
};

export default RegularIncomeSettings;
