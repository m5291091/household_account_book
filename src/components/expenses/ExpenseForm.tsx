"use client";

import { useState, useEffect, useRef } from 'react';
import { db, storage } from '@/lib/firebase/config';
import { collection, addDoc, updateDoc, doc, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { Category } from '@/types/Category';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Expense, ExpenseFormData } from '@/types/Expense';
import { format } from 'date-fns';
import { useCategorySuggestion } from '@/hooks/useCategorySuggestion';
import AddItemModal from '@/components/ui/AddItemModal';

interface ExpenseFormProps {
  expenseToEdit?: Expense | null;
  onFormClose?: () => void;
  initialData?: Partial<ExpenseFormData> | null;
  setInitialData?: (data: Partial<ExpenseFormData> | null) => void;
}

const ExpenseForm = ({ expenseToEdit, onFormClose, initialData, setInitialData }: ExpenseFormProps) => {
  const { user, loading: authLoading } = useAuth();
  const { suggestionMap } = useCategorySuggestion();
  const [formData, setFormData] = useState<ExpenseFormData>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    categoryId: '',
    paymentMethodId: '',
    store: '',
    memo: '',
    irregularMonth: '',
    receiptFile: null,
    receiptUrl: '',
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  
  const [isTransfer, setIsTransfer] = useState(false);

  const isEditMode = !!expenseToEdit;

  // Refs for focus management
  const dateRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const paymentMethodRef = useRef<HTMLSelectElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      categoryId: '',
      paymentMethodId: '',
      store: '',
      memo: '',
      irregularMonth: '',
      receiptFile: null,
      receiptUrl: '',
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (initialData && setInitialData) {
      setFormData(prev => ({
        ...prev,
        ...initialData,
        date: new Date().toISOString().split('T')[0],
        irregularMonth: initialData.irregularMonth || '',
      }));
      setInitialData(null);
    }
  }, [initialData, setInitialData]);

  useEffect(() => {
    if (isEditMode && expenseToEdit) {
      setFormData({
        date: format(expenseToEdit.date.toDate(), 'yyyy-MM-dd'),
        amount: expenseToEdit.amount.toString(),
        categoryId: expenseToEdit.categoryId,
        paymentMethodId: expenseToEdit.paymentMethodId,
        store: expenseToEdit.store || '',
        memo: expenseToEdit.memo || '',
        irregularMonth: expenseToEdit.irregularDate ? format(expenseToEdit.irregularDate.toDate(), 'yyyy-MM') : '',
        receiptFile: null,
        receiptUrl: expenseToEdit.receiptUrl || '',
      });
      setIsTransfer(!!expenseToEdit.isTransfer);
    } else if (!initialData) {
      resetForm();
      setIsTransfer(false);
    }
  }, [expenseToEdit, isEditMode, initialData]);

  useEffect(() => {
    if (authLoading || !user) return;

    const categoriesQuery = query(collection(db, 'users', user.uid, 'categories'));
    const unsubscribeCategories = onSnapshot(categoriesQuery, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    });

    const paymentMethodsQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
    const unsubscribePaymentMethods = onSnapshot(paymentMethodsQuery, (snapshot) => {
      setPaymentMethods(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentMethod)));
    });

    return () => {
      unsubscribeCategories();
      unsubscribePaymentMethods();
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (formData.store && !formData.categoryId) {
      const storeKey = formData.store.trim().toLowerCase();
      const suggestedCategoryId = suggestionMap.get(storeKey);
      if (suggestedCategoryId) {
        setFormData(prev => ({ ...prev, categoryId: suggestedCategoryId }));
      }
    }
  }, [formData.store, suggestionMap]);

  const handleAmountBlur = () => {
    try {
      // Basic sanitization
      const sanitized = formData.amount.replace(/[^0-9+\-*/.()\s]/g, '');
      if (!sanitized) return;

      // Evaluate
      // eslint-disable-next-line no-new-func
      const result = new Function('return ' + sanitized)();

      if (!isNaN(result) && isFinite(result)) {
        setFormData(prev => ({ ...prev, amount: Math.floor(result).toString() }));
      }
    } catch (e) {
      // Ignore invalid expression
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const adjustDate = (days: number) => {
    setFormData(prev => {
      if (!prev.date) return prev;
      const date = new Date(prev.date);
      date.setDate(date.getDate() + days);
      return { ...prev, date: date.toISOString().split('T')[0] };
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>) => {
    const target = e.target as HTMLElement;

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (target.id !== 'submitButton') {
        e.preventDefault();
        switch (target.id) {
          case 'date':
            amountRef.current?.focus();
            break;
          case 'amount':
            storeRef.current?.focus();
            break;
          case 'store':
            categoryRef.current?.focus();
            break;
          case 'categoryId':
            paymentMethodRef.current?.focus();
            break;
          case 'paymentMethodId':
            memoRef.current?.focus();
            break;
          case 'paymentMethodId':
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
        case 'amount':
          dateRef.current?.focus();
          break;
        case 'store':
          amountRef.current?.focus();
          break;
        case 'categoryId':
          storeRef.current?.focus();
          break;
        case 'paymentMethodId':
          categoryRef.current?.focus();
          break;
        case 'memo':
          paymentMethodRef.current?.focus();
          break;
        case 'submitButton':
          memoRef.current?.focus();
          break;
        default:
          break;
      }
    }
  };

  const handleAddCategory = async (name: string) => {
    if (!user) return;
    const docRef = await addDoc(collection(db, 'users', user.uid, 'categories'), { name });
    setFormData(prev => ({ ...prev, categoryId: docRef.id }));
  };

  const handleAddPaymentMethod = async (name: string) => {
    if (!user) return;
    const docRef = await addDoc(collection(db, 'users', user.uid, 'paymentMethods'), { name });
    setFormData(prev => ({ ...prev, paymentMethodId: docRef.id }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, receiptFile: e.target.files![0] }));
    }
  };

  const handleRemoveFile = () => {
    setFormData(prev => ({ ...prev, receiptFile: null, receiptUrl: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user || !formData.categoryId || !formData.paymentMethodId || !formData.amount) {
      setError('日付、金額、カテゴリー、支払い方法は必須です。');
      return;
    }

    try {
      setIsUploading(true);
      let receiptUrl = formData.receiptUrl || '';

      if (formData.receiptFile) {
        const file = formData.receiptFile;
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.uid}-${Date.now()}.${fileExt}`;
        const storageRef = ref(storage, `receipts/${user.uid}/${fileName}`);
        
        await uploadBytes(storageRef, file);
        receiptUrl = await getDownloadURL(storageRef);
      }

      const dataToSave = {
        date: Timestamp.fromDate(new Date(formData.date)),
        amount: Number(formData.amount),
        categoryId: formData.categoryId,
        paymentMethodId: formData.paymentMethodId,
        store: formData.store.trim(),
        memo: formData.memo.trim(),
        irregularDate: formData.irregularMonth ? Timestamp.fromDate(new Date(`${formData.irregularMonth}-01`)) : null,
        receiptUrl: receiptUrl || "",
        isTransfer: isTransfer,
      };

      if (isEditMode && expenseToEdit) {
        const expenseRef = doc(db, 'users', user.uid, 'expenses', expenseToEdit.id);
        await updateDoc(expenseRef, dataToSave);
        setSuccess('支出を更新しました。');
      } else {
        await addDoc(collection(db, 'users', user.uid, 'expenses'), {
          ...dataToSave,
          isChecked: false,
        });
        setSuccess('支出を記録しました。');
      }

      if (onFormClose) {
        onFormClose();
      } else {
        resetForm();
        dateRef.current?.focus();
      }
    } catch (err) {
      console.error(err);
      setError(isEditMode ? '支出の更新に失敗しました。' : '支出の記録に失敗しました。');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">{isEditMode ? '支出を編集' : '支出を記録'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-200">支出日</label>
            <div className="mt-1 flex items-center">
              <button
                type="button"
                onClick={() => adjustDate(-1)}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-l-md hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                ◀
              </button>
              <input ref={dateRef} type="date" name="date" id="date" value={formData.date} onChange={handleChange} onKeyDown={handleKeyDown} required className="block w-full px-3 py-2 bg-white dark:bg-black border-y border-gray-300 dark:border-gray-600 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-center"/>
              <button
                type="button"
                onClick={() => adjustDate(1)}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-r-md hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                ▶
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="irregularMonth" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              計上月（イレギュラー時のみ）
              <span className="text-xs text-gray-500 font-normal ml-2">※通常は空欄。月またぎの場合のみ計上先の月を選択してください</span>
            </label>
            <input type="month" name="irregularMonth" id="irregularMonth" value={formData.irregularMonth} onChange={handleChange} onKeyDown={handleKeyDown} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
          </div>
        </div>
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200 dark:text-gray-300">金額</label>
          <input ref={amountRef} type="text" name="amount" id="amount" value={formData.amount} onChange={handleChange} onBlur={handleAmountBlur} onKeyDown={handleKeyDown} placeholder="0 または 100+50" required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"/>
        </div>
        <div>
          <label htmlFor="store" className="block text-sm font-medium text-gray-700 dark:text-gray-200">店名・サービス名</label>
          <input ref={storeRef} type="text" name="store" id="store" value={formData.store} onChange={handleChange} onKeyDown={handleKeyDown} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700 dark:text-gray-200">カテゴリー</label>
          <div className="flex gap-2">
            <select ref={categoryRef} name="categoryId" id="categoryId" value={formData.categoryId} onChange={handleChange} onKeyDown={handleKeyDown} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
              <option value="">選択してください</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="mt-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 font-bold">+</button>
          </div>
        </div>
        <div>
          <label htmlFor="paymentMethodId" className="block text-sm font-medium text-gray-700 dark:text-gray-200">支払い方法</label>
          <div className="flex gap-2">
            <select ref={paymentMethodRef} name="paymentMethodId" id="paymentMethodId" value={formData.paymentMethodId} onChange={handleChange} onKeyDown={handleKeyDown} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
              <option value="">選択してください</option>
              {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" onClick={() => setIsPaymentMethodModalOpen(true)} className="mt-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 font-bold">+</button>
          </div>
        </div>
        <div>
          <label htmlFor="memo" className="block text-sm font-medium text-gray-700 dark:text-gray-200">メモ</label>
          <textarea ref={memoRef} name="memo" id="memo" value={formData.memo} onChange={handleChange} onKeyDown={handleKeyDown} rows={3} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-black border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></textarea>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">レシート・領収書</label>
          <div className="mt-1 flex items-center gap-4">
            <input 
              type="file" 
              accept="image/*,.pdf"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-indigo-50 file:text-indigo-700
                dark:file:bg-indigo-900 dark:file:text-indigo-200
                hover:file:bg-indigo-100 dark:hover:file:bg-indigo-800"
            />
            {(formData.receiptFile || formData.receiptUrl) && (
              <button 
                type="button" 
                onClick={handleRemoveFile}
                className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 whitespace-nowrap"
              >
                削除
              </button>
            )}
          </div>
          {formData.receiptUrl && !formData.receiptFile && (
            <div className="mt-2">
              <a href={formData.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                アップロード済みのファイルを確認
              </a>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
          <input
            type="checkbox"
            id="isTransfer"
            checked={isTransfer}
            onChange={(e) => setIsTransfer(e.target.checked)}
            className="h-4 w-4 text-amber-600 rounded"
          />
          <label htmlFor="isTransfer" className="text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
            <span className="font-medium">振替として記録（支出集計から除外）</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              電子マネーへのチャージ・口座間の振替など、実際の消費ではない支出にチェックしてください
            </span>
          </label>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-500 text-sm">{success}</p>}
        <div className="flex items-center space-x-4">
          <button ref={submitButtonRef} type="submit" id="submitButton" onKeyDown={handleKeyDown} disabled={isUploading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            {isUploading ? '保存中...' : (isEditMode ? '更新する' : '記録する')}
          </button>
          {isEditMode && onFormClose && (
            <button type="button" onClick={onFormClose} disabled={isUploading} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 dark:text-gray-100 font-bold py-2 px-4 rounded-md">
              キャンセル
            </button>
          )}
        </div>
      </form>

      <AddItemModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onAdd={handleAddCategory}
        title="カテゴリーを追加"
        placeholder="カテゴリー名 (例: 食費)"
      />
      <AddItemModal
        isOpen={isPaymentMethodModalOpen}
        onClose={() => setIsPaymentMethodModalOpen(false)}
        onAdd={handleAddPaymentMethod}
        title="支払い方法を追加"
        placeholder="支払い方法名 (例: PayPay)"
      />
    </div>
  );
};

export default ExpenseForm;
