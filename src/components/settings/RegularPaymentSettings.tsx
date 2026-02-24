import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, Timestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularPayment, RegularPaymentFormData } from '@/types/RegularPayment';
import { RegularPaymentGroup } from '@/types/RegularPaymentGroup';
import { Category } from '@/types/Category';
import { PaymentMethod } from '@/types/PaymentMethod';
import { format } from 'date-fns';
import Link from 'next/link';

const RegularPaymentSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularPayment[]>([]);
  const [groups, setGroups] = useState<RegularPaymentGroup[]>([]);
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
    groupId: '',
  });
  
  const [newGroupName, setNewGroupName] = useState('');
  
  // Bulk selection state
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<string>(''); // 'group', 'category', 'method', 'date', 'delete'
  const [bulkValue, setBulkValue] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  
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
    const unsubGroups = onSnapshot(query(collection(db, 'users', user.uid, 'regularPaymentGroups'), orderBy('name')), s => {
      setGroups(s.docs.map(d => ({ id: d.id, ...d.data() } as RegularPaymentGroup)));
    });
    return () => { unsubCategories(); unsubPaymentMethods(); unsubTemplates(); unsubGroups(); };
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
      groupId: '',
    });
    setError(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newGroupName.trim()) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'regularPaymentGroups'), { name: newGroupName.trim(), order: 0 });
      setNewGroupName('');
    } catch (err) {
      console.error(err);
      setError('グループの追加に失敗しました。');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!user || !confirm('このグループを削除しますか？')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'regularPaymentGroups', id));
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
        groupId: formData.groupId || null,
      };

      await addDoc(collection(db, 'users', user.uid, 'regularPayments'), dataToSave);
      resetForm();
    } catch (err) {
      console.error(err);
      setError('テンプレートの追加に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('このテンプレートを削除しますか？')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'regularPayments', id));
  };

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
        const ref = doc(db, 'users', user.uid, 'regularPayments', id);
        
        switch (bulkAction) {
          case 'delete':
            batch.delete(ref);
            break;
          case 'group':
            batch.update(ref, { groupId: bulkValue === 'none' ? null : bulkValue });
            break;
          case 'category':
            batch.update(ref, { categoryId: bulkValue });
            break;
          case 'method':
            batch.update(ref, { paymentMethodId: bulkValue });
            break;
          case 'date':
            const date = new Date(bulkValue);
            batch.update(ref, { 
              nextPaymentDate: Timestamp.fromDate(date),
              paymentDay: date.getDate()
            });
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

  // Group templates and Calculate Totals
  const groupedTemplates = new Map<string, RegularPayment[]>();
  const noGroupTemplates: RegularPayment[] = [];
  const groupTotals = new Map<string, number>();
  let noGroupTotal = 0;
  let grandTotal = 0;

  templates.forEach(t => {
    grandTotal += t.amount;
    if (t.groupId && groups.some(g => g.id === t.groupId)) {
      if (!groupedTemplates.has(t.groupId)) groupedTemplates.set(t.groupId, []);
      groupedTemplates.get(t.groupId)!.push(t);
      
      const currentGroupTotal = groupTotals.get(t.groupId) || 0;
      groupTotals.set(t.groupId, currentGroupTotal + t.amount);
    } else {
      noGroupTemplates.push(t);
      noGroupTotal += t.amount;
    }
  });

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md space-y-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">定期支出の管理</h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {/* Group Management */}
      <section className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
        <h3 className="text-lg font-semibold mb-2">グループ管理</h3>
        <form onSubmit={handleAddGroup} className="flex gap-2 mb-2">
          <input 
            type="text" 
            value={newGroupName} 
            onChange={(e) => setNewGroupName(e.target.value)} 
            placeholder="新しいグループ名 (例: サブスク)" 
            className="flex-grow p-2 border rounded"
          />
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">追加</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {groups.map(g => (
            <div key={g.id} className="flex items-center bg-white dark:bg-black border px-3 py-1 rounded-full text-sm">
              <span className="mr-2">{g.name}</span>
              <button onClick={() => handleDeleteGroup(g.id)} className="text-red-500 hover:text-red-700">×</button>
            </div>
          ))}
        </div>
      </section>

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
              <option value="group">グループ変更</option>
              <option value="category">カテゴリー変更</option>
              <option value="method">支払い方法変更</option>
              <option value="date">次回支払日変更</option>
              <option value="delete">削除</option>
            </select>

            {/* Dynamic Value Input */}
            {bulkAction === 'group' && (
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="p-2 border rounded flex-grow">
                    <option value="">グループを選択...</option>
                    <option value="none">グループなし</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
            )}
            {bulkAction === 'category' && (
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="p-2 border rounded flex-grow">
                    <option value="">カテゴリーを選択...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            )}
             {bulkAction === 'method' && (
                <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="p-2 border rounded flex-grow">
                    <option value="">支払い方法を選択...</option>
                    {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            )}
            {bulkAction === 'date' && (
                <input type="date" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="p-2 border rounded flex-grow" />
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

      {/* Add Template Form */}
      <form onSubmit={handleSubmit} className="space-y-4 p-4 border-2 border-indigo-100 rounded-lg">
        <h3 className="text-lg font-semibold">新規テンプレート追加</h3>
        <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="名称 (例: 家賃)" required className="w-full p-2 border rounded"/>
        <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="基準額" required className="w-full p-2 border rounded"/>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select name="categoryId" value={formData.categoryId} onChange={handleChange} required className="w-full p-2 border rounded"><option value="">カテゴリー</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="paymentMethodId" value={formData.paymentMethodId} onChange={handleChange} required className="w-full p-2 border rounded"><option value="">支払い方法</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
        
        <div>
          <label htmlFor="nextPaymentDate" className="block text-sm font-medium text-gray-700 dark:text-gray-200">初回支払日</label>
          <input type="date" id="nextPaymentDate" name="nextPaymentDate" value={formData.nextPaymentDate} onChange={handleChange} required className="w-full p-2 border rounded"/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <label>間隔:</label>
            <input type="number" name="interval" value={formData.interval} onChange={handleChange} min="1" required className="p-2 border rounded w-20"/>
            <select name="frequency" value={formData.frequency} onChange={handleChange} className="p-2 border rounded">
              <option value="months">ヶ月ごと</option>
              <option value="years">年ごと</option>
            </select>
          </div>
          <select name="groupId" value={formData.groupId} onChange={handleChange} className="w-full p-2 border rounded">
            <option value="">グループ (なし)</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="flex space-x-2 pt-2">
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-md shadow-sm">
            追加
          </button>
        </div>
      </form>

      {/* List */}
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="text-xl font-bold">登録済みテンプレート</h3>
        <p className="text-lg font-bold text-gray-700 dark:text-gray-200">合計: ¥{grandTotal.toLocaleString()}</p>
      </div>
      {loading ? <p>読み込み中...</p> : (
        <div className="space-y-6">
          {groups.map(g => {
            const groupTemplates = groupedTemplates.get(g.id);
            if (!groupTemplates || groupTemplates.length === 0) return null;
            const groupTotal = groupTotals.get(g.id) || 0;
            return (
              <div key={g.id} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 font-bold text-gray-700 dark:text-gray-200 border-b flex justify-between">
                  <span>{g.name}</span>
                  <span>小計: ¥{groupTotal.toLocaleString()}</span>
                </div>
                <ul className="divide-y">
                  {groupTemplates.map(t => (
                    <li key={t.id} className="p-3 flex items-center hover:bg-gray-50 dark:bg-gray-900">
                      <input 
                        type="checkbox" 
                        checked={selectedTemplateIds.includes(t.id)} 
                        onChange={() => handleToggleSelect(t.id)}
                        className="mr-3 h-5 w-5 text-indigo-600 rounded cursor-pointer"
                      />
                      <div className="flex-grow flex justify-between items-center">
                        <div>
                          <p className="font-bold">{t.name} - ¥{t.amount.toLocaleString()}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            次回: {t.nextPaymentDate ? format(t.nextPaymentDate.toDate(), 'yyyy/MM/dd') : '未設定'}
                          </p>
                        </div>
                        <div className="flex space-x-3 text-sm">
                          <Link href={`/settings/edit-template/${t.id}`} className="text-blue-500 hover:text-blue-700 font-medium">編集</Link>
                          <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700 font-medium">削除</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {/* No Group */}
          {noGroupTemplates.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 font-bold text-gray-700 dark:text-gray-200 border-b flex justify-between">
                <span>グループなし</span>
                <span>小計: ¥{noGroupTotal.toLocaleString()}</span>
              </div>
              <ul className="divide-y">
                {noGroupTemplates.map(t => (
                  <li key={t.id} className="p-3 flex items-center hover:bg-gray-50 dark:bg-gray-900">
                    <input 
                      type="checkbox" 
                      checked={selectedTemplateIds.includes(t.id)} 
                      onChange={() => handleToggleSelect(t.id)}
                      className="mr-3 h-5 w-5 text-indigo-600 rounded cursor-pointer"
                    />
                    <div className="flex-grow flex justify-between items-center">
                      <div>
                        <p className="font-bold">{t.name} - ¥{t.amount.toLocaleString()}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          次回: {t.nextPaymentDate ? format(t.nextPaymentDate.toDate(), 'yyyy/MM/dd') : '未設定'}
                        </p>
                      </div>
                      <div className="flex space-x-3 text-sm">
                        <Link href={`/settings/edit-template/${t.id}`} className="text-blue-500 hover:text-blue-700 font-medium">編集</Link>
                        <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700 font-medium">削除</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RegularPaymentSettings;