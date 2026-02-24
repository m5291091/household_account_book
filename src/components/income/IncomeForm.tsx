import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, doc, updateDoc, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Income } from '@/types/Income';
import { format } from 'date-fns';
import AddItemModal from '@/components/ui/AddItemModal';

interface IncomeFormProps {
  incomeToEdit?: Income | null;
  onFormClose?: () => void;
}

interface IncomeCategory {
  id: string;
  name: string;
}

const IncomeForm = forwardRef(({ incomeToEdit, onFormClose }: IncomeFormProps, ref) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    source: '',
    amount: '',
    totalTaxableAmount: '',
    date: new Date().toISOString().split('T')[0],
    category: '',
    memo: '',
  });
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  // Refs for focus management
  const formRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const taxRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(ref, () => ({
    scrollIntoView: () => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }));

  const isEditMode = !!incomeToEdit;

  const resetForm = () => {
    setFormData({
      source: '',
      amount: '',
      totalTaxableAmount: '',
      date: new Date().toISOString().split('T')[0],
      category: '',
      memo: '',
    });
    setSuccess(null);
    setError(null);
  };

  useEffect(() => {
    if (isEditMode && incomeToEdit) {
      setFormData({
        source: incomeToEdit.source,
        amount: incomeToEdit.amount.toString(),
        totalTaxableAmount: incomeToEdit.totalTaxableAmount?.toString() || '',
        date: format(incomeToEdit.date.toDate(), 'yyyy-MM-dd'),
        category: incomeToEdit.category,
        memo: incomeToEdit.memo || '',
      });
    } else {
      resetForm();
    }
  }, [incomeToEdit, isEditMode]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'incomeCategories'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncomeCategory));
      setCategories(fetchedCategories);
    });
    return () => unsubscribe();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAddCategory = async (name: string) => {
    if (!user) return;
    await addDoc(collection(db, 'users', user.uid, 'incomeCategories'), { name });
    setFormData(prev => ({ ...prev, category: name }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | HTMLSelectElement>) => {
    const target = e.target as HTMLElement;

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (target.id !== 'submitButton') {
        e.preventDefault();
        switch (target.id) {
          case 'date':
            sourceRef.current?.focus();
            break;
          case 'source':
            amountRef.current?.focus();
            break;
          case 'amount':
            taxRef.current?.focus();
            break;
          case 'totalTaxableAmount':
            categoryRef.current?.focus();
            break;
          case 'category':
            memoRef.current?.focus();
            break;
          case 'memo':
            submitButtonRef.current?.focus();
            break;
          default:
            break;
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      switch (target.id) {
        case 'source':
          dateRef.current?.focus();
          break;
        case 'amount':
          sourceRef.current?.focus();
          break;
        case 'totalTaxableAmount':
          amountRef.current?.focus();
          break;
        case 'category':
          taxRef.current?.focus();
          break;
        case 'memo':
          categoryRef.current?.focus();
          break;
        case 'submitButton':
          memoRef.current?.focus();
          break;
        default:
          break;
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user || !formData.source || !formData.amount || !formData.date || !formData.category) {
      setError('必須項目をすべて入力してください。');
      return;
    }

    try {
      const dataToSave = {
        source: formData.source.trim(),
        amount: Number(formData.amount),
        totalTaxableAmount: Number(formData.totalTaxableAmount) || 0,
        date: Timestamp.fromDate(new Date(formData.date)),
        category: formData.category.trim(),
        memo: formData.memo.trim(),
      };

      if (isEditMode && incomeToEdit) {
        const incomeRef = doc(db, 'users', user.uid, 'incomes', incomeToEdit.id);
        await updateDoc(incomeRef, dataToSave);
        setSuccess('収入を更新しました。');
      } else {
        await addDoc(collection(db, 'users', user.uid, 'incomes'), dataToSave);
        setSuccess('収入を記録しました。');
        resetForm();
        setTimeout(() => {
          dateRef.current?.focus();
        }, 0);
      }

      if (onFormClose) {
        onFormClose();
      }
    } catch (err) {
      console.error(err);
      setError(isEditMode ? '収入の更新に失敗しました。' : '収入の記録に失敗しました。');
    }
  };

  return (
    <div ref={formRef} className="bg-white dark:bg-black p-6 rounded-lg shadow-md scroll-mt-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">{isEditMode ? '収入を編集' : '収入を記録'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-200">日付</label>
          <input ref={dateRef} type="date" name="date" id="date" value={formData.date} onChange={handleChange} onKeyDown={handleKeyDown} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="source" className="block text-sm font-medium text-gray-700 dark:text-gray-200">収入源</label>
          <input ref={sourceRef} type="text" name="source" id="source" value={formData.source} onChange={handleChange} onKeyDown={handleKeyDown} placeholder="給与、ボーナスなど" required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200">差引支給額</label>
          <input ref={amountRef} type="number" name="amount" id="amount" value={formData.amount} onChange={handleChange} onKeyDown={handleKeyDown} placeholder="手取り額" required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="totalTaxableAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-200">課税合計</label>
          <input ref={taxRef} type="number" name="totalTaxableAmount" id="totalTaxableAmount" value={formData.totalTaxableAmount} onChange={handleChange} onKeyDown={handleKeyDown} placeholder="所得税・住民税など" className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-200">カテゴリー</label>
          <div className="flex gap-2">
            <select ref={categoryRef} name="category" id="category" value={formData.category} onChange={handleChange} onKeyDown={handleKeyDown} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
              <option value="">選択してください</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="mt-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 font-bold">+</button>
          </div>
        </div>
        <div>
          <label htmlFor="memo" className="block text-sm font-medium text-gray-700 dark:text-gray-200">メモ</label>
          <textarea ref={memoRef} name="memo" id="memo" value={formData.memo} onChange={handleChange} onKeyDown={handleKeyDown} rows={3} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></textarea>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-500 text-sm">{success}</p>}
        <div className="flex items-center space-x-4">
          <button ref={submitButtonRef} type="submit" id="submitButton" onKeyDown={handleKeyDown} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            {isEditMode ? '更新する' : '記録する'}
          </button>
          {isEditMode && onFormClose && (
            <button type="button" onClick={onFormClose} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 dark:text-gray-100 font-bold py-2 px-4 rounded-md">
              キャンセル
            </button>
          )}
        </div>
      </form>

      <AddItemModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onAdd={handleAddCategory}
        title="収入カテゴリーを追加"
        placeholder="カテゴリー名 (例: 給料)"
      />
    </div>
  );
});

IncomeForm.displayName = 'IncomeForm';
export default IncomeForm;