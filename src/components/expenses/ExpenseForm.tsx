"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, updateDoc, doc, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Category } from '@/types/Category';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Expense, ExpenseFormData } from '@/types/Expense';
import { format } from 'date-fns';
import { useCategorySuggestion } from '@/hooks/useCategorySuggestion';

interface ExpenseFormProps {
  expenseToEdit?: Expense | null;
  onFormClose?: () => void;
  initialData?: Partial<ExpenseFormData> | null;
  setInitialData?: (data: Partial<ExpenseFormData> | null) => void;
}

const ExpenseForm = ({ expenseToEdit, onFormClose, initialData, setInitialData }: ExpenseFormProps) => {
  const { user, loading: authLoading } = useAuth();
  const { suggestionMap } = useCategorySuggestion();
  const [formData, setFormData] = useState<Omit<ExpenseFormData, 'isIrregular'>>({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    categoryId: '',
    paymentMethodId: '',
    store: '',
    memo: '',
  });
  const [isIrregular, setIsIrregular] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const isEditMode = !!expenseToEdit;

  // Refs for focus management
  const dateRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const storeRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const paymentMethodRef = useRef<HTMLSelectElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      categoryId: '',
      paymentMethodId: '',
      store: '',
      memo: '',
    });
    setIsIrregular(false);
  };

  useEffect(() => {
    if (initialData && setInitialData) {
      setFormData(prev => ({
        ...prev,
        ...initialData,
        date: new Date().toISOString().split('T')[0],
      }));
      setIsIrregular(initialData.isIrregular || false);
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
      });
      setIsIrregular(expenseToEdit.isIrregular || false);
    } else if (!initialData) {
      resetForm();
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>) => {
    const target = e.target as HTMLElement;

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
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
        case 'memo':
          submitButtonRef.current?.focus();
          break;
        default:
          break;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user || !formData.categoryId || !formData.paymentMethodId || !formData.amount) {
      setError('日付、金額、カテゴリー、支払い方法は必須です。');
      return;
    }

    try {
      const dataToSave = {
        date: Timestamp.fromDate(new Date(formData.date)),
        amount: Number(formData.amount),
        categoryId: formData.categoryId,
        paymentMethodId: formData.paymentMethodId,
        store: formData.store.trim(),
        memo: formData.memo.trim(),
        isIrregular: isIrregular,
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
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">{isEditMode ? '支出を編集' : '支出を記録'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700">日付</label>
          <input ref={dateRef} type="date" name="date" id="date" value={formData.date} onChange={handleChange} onKeyDown={handleKeyDown} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">金額</label>
          <input ref={amountRef} type="number" name="amount" id="amount" value={formData.amount} onChange={handleChange} onKeyDown={handleKeyDown} placeholder="0" required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="store" className="block text-sm font-medium text-gray-700">店名・サービス名</label>
          <input ref={storeRef} type="text" name="store" id="store" value={formData.store} onChange={handleChange} onKeyDown={handleKeyDown} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">カテゴリー</label>
          <select ref={categoryRef} name="categoryId" id="categoryId" value={formData.categoryId} onChange={handleChange} onKeyDown={handleKeyDown} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">選択してください</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="paymentMethodId" className="block text-sm font-medium text-gray-700">支払い方法</label>
          <select ref={paymentMethodRef} name="paymentMethodId" id="paymentMethodId" value={formData.paymentMethodId} onChange={handleChange} onKeyDown={handleKeyDown} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">選択してください</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="memo" className="block text-sm font-medium text-gray-700">メモ</label>
          <textarea ref={memoRef} name="memo" id="memo" value={formData.memo} onChange={handleChange} onKeyDown={handleKeyDown} rows={3} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></textarea>
        </div>
        <div className="flex items-center">
          <input
            id="isIrregular"
            name="isIrregular"
            type="checkbox"
            checked={isIrregular}
            onChange={(e) => setIsIrregular(e.target.checked)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          />
          <label htmlFor="isIrregular" className="ml-2 block text-sm text-gray-900">
            イレギュラー支出 (カレンダーの日付に紐付けない)
          </label>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-500 text-sm">{success}</p>}
        <div className="flex items-center space-x-4">
          <button ref={submitButtonRef} type="submit" id="submitButton" onKeyDown={handleKeyDown} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            {isEditMode ? '更新する' : '記録する'}
          </button>
          {isEditMode && onFormClose && (
            <button type="button" onClick={onFormClose} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-md">
              キャンセル
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ExpenseForm;
