"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, orderBy, where, Timestamp, writeBatch, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseFormData, CheckStatus } from '@/types/Expense';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Category } from '@/types/Category';
import { format, startOfMonth, endOfMonth, getDaysInMonth, getDate, parseISO, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { createPortal } from 'react-dom';
import Link from 'next/link';

import Skeleton from '@/components/ui/Skeleton';

interface ExpenseListProps {
  month: Date;
  onEditExpense: (expense: Expense) => void;
  onCopyExpense: (data: Partial<ExpenseFormData>) => void;
  viewMode: 'list' | 'calendar' | 'monthly_grid';
  headerAction?: React.ReactNode;
  title?: string;
}

interface PopoverState {
  visible: boolean;
  expenses: Expense[];
  style: React.CSSProperties;
  title: string;
  cellKey?: string;
}

type BulkEditField = 'categoryId' | 'paymentMethodId' | 'store' | 'memo' | 'date';

import { useExpenses } from '@/hooks/useExpenses';
import { useMasterData } from '@/hooks/useMasterData';

const ExpenseList = ({ month, onEditExpense, onCopyExpense, viewMode, headerAction, title = "支出履歴" }: ExpenseListProps) => {
  const { user, loading: authLoading } = useAuth();
  
  // Filtering and Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Calculate effective query dates
  const { queryStart, queryEnd } = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    
    let start = monthStart;
    let end = monthEnd;

    if (viewMode === 'list' && startDate && endDate) {
      start = parseISO(startDate);
      end = parseISO(`${endDate}T23:59:59`);
    }
    return { queryStart: start, queryEnd: end };
  }, [month, viewMode, startDate, endDate]);

  // Custom Hooks
  const { expenses: allMonthExpenses, loading: expensesLoading, error: expensesError } = useExpenses(user?.uid, queryStart, queryEnd);
  const { categories, paymentMethods, loading: masterLoading } = useMasterData(user?.uid);

  const loading = expensesLoading || masterLoading || authLoading;
  const error = expensesError; // Simplified error handling

  const [popover, setPopover] = useState<PopoverState>({ visible: false, expenses: [], style: {}, title: '' });
  const popoverRef = useRef<HTMLDivElement>(null);

  // New features state
  const [checkStatuses, setCheckStatuses] = useState<CheckStatus[]>([
    { id: 'default', color: '#d4edda', label: '確認済み' }
  ]);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [aggregateChecks, setAggregateChecks] = useState<{[key: string]: string | boolean}>({});

  // Bulk update states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditField, setBulkEditField] = useState<BulkEditField>('categoryId');
  const [bulkEditValue, setBulkEditValue] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  // Manual setError for other ops
  const [opError, setOpError] = useState<string | null>(null); 

  useEffect(() => {
    if (authLoading || !user) return;

    // Fetch Check Statuses
    const settingsDocRef = doc(db, 'users', user.uid, 'settings', 'general');
    const unsubSettings = onSnapshot(settingsDocRef, (snap) => {
      if (snap.exists() && snap.data().checkStatuses) {
        setCheckStatuses(snap.data().checkStatuses);
      } else if (snap.exists() && snap.data().checkColor) {
        setCheckStatuses([{ id: 'default', color: snap.data().checkColor, label: '確認済み' }]);
      } else {
        setCheckStatuses([{ id: 'default', color: '#d4edda', label: '確認済み' }]);
      }
    });

    // Fetch Aggregate Checks
    const monthKey = format(month, 'yyyy-MM');
    const checksDocRef = doc(db, 'users', user.uid, 'monthlyChecks', monthKey);
    const unsubChecks = onSnapshot(checksDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setAggregateChecks(docSnap.data() as {[key: string]: string | boolean});
      } else {
        setAggregateChecks({});
      }
    });

    return () => {
      unsubSettings();
      unsubChecks();
    };
  }, [user, month, authLoading]);

  // Popover click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPopover(p => ({ ...p, visible: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popoverRef]);

  const filteredExpenses = useMemo(() => {
    return allMonthExpenses.filter(expense => {
      const searchLower = searchQuery.toLowerCase();
      const storeMatch = expense.store?.toLowerCase().includes(searchLower);
      const memoMatch = expense.memo?.toLowerCase().includes(searchLower);
      const searchMatch = !searchQuery || storeMatch || memoMatch;

      const paymentMethodMatch = !selectedPaymentMethod || expense.paymentMethodId === selectedPaymentMethod;
      const categoryMatch = !selectedCategory || expense.categoryId === selectedCategory;

      const expenseDate = expense.date.toDate();
      const startMatch = !startDate || expenseDate >= parseISO(startDate);
      const endMatch = !endDate || expenseDate <= parseISO(`${endDate}T23:59:59`);
      
      return searchMatch && paymentMethodMatch && categoryMatch && startMatch && endMatch;
    });
  }, [allMonthExpenses, searchQuery, selectedPaymentMethod, selectedCategory, startDate, endDate]);

  const regularExpenses = useMemo(() => filteredExpenses.filter(exp => !exp.irregularDate), [filteredExpenses]);
  const irregularExpenses = useMemo(() => filteredExpenses.filter(exp => !!exp.irregularDate), [filteredExpenses]);

  const handleDelete = async (id: string) => {
    if (!user || !confirm('この支出を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
      setPopover(p => ({ ...p, visible: false }));
    } catch (err) { console.error(err); setOpError('支出の削除に失敗しました。'); }
  };
  
  const handleToggleCheck = async (expenseToToggle: Expense) => {
    if (!user) return;

    const currentStatus = expenseToToggle.checkStatusId || expenseToToggle.isChecked;
    const nextStatus = cycleStatus(currentStatus);
    const newIsChecked = !!nextStatus;
    const newCheckStatusId = typeof nextStatus === 'string' ? nextStatus : null;

    // Optimistic UI update for popover only (list updates via subscription)
    const updatedPopoverExpenses = popover.expenses.map(exp =>
      exp.id === expenseToToggle.id ? { ...exp, isChecked: newIsChecked, checkStatusId: newCheckStatusId } : exp
    );
    setPopover(prev => ({ ...prev, expenses: updatedPopoverExpenses }));

    // Update Firestore
    const expenseRef = doc(db, 'users', user.uid, 'expenses', expenseToToggle.id);
    try {
      await updateDoc(expenseRef, { 
        isChecked: newIsChecked,
        checkStatusId: newCheckStatusId
      });
    } catch (err) { 
      console.error(err); 
      setOpError('支出のチェック状態の更新に失敗しました。');
      // Revert popover on error
      setPopover(prev => ({ ...prev, expenses: popover.expenses }));
    }
  };

  const handleCopy = (expense: Expense) => {
    onCopyExpense({
      amount: expense.amount.toString(),
      categoryId: expense.categoryId,
      paymentMethodId: expense.paymentMethodId,
      store: expense.store,
      memo: expense.memo,
      irregularMonth: expense.irregularDate ? format(expense.irregularDate.toDate(), 'yyyy-MM') : '',
    });
    setPopover(p => ({ ...p, visible: false }));
    alert('支出フォームに内容をコピーしました。');
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredExpenses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredExpenses.map(exp => exp.id));
    }
  };

  const handleBulkUpdate = async () => {
    if (!user || selectedIds.length === 0 || !bulkEditField || !bulkEditValue) {
      alert('更新する項目を選択し、値を入力してください。');
      return;
    }
    if (!confirm(`${selectedIds.length}件の支出を更新します。よろしいですか？`)) return;

    setIsUpdating(true);
    setOpError(null);
    const batch = writeBatch(db);
    
    let updateData: any = {};
    if (bulkEditField === 'date') {
      updateData[bulkEditField] = Timestamp.fromDate(parseISO(bulkEditValue));
    } else {
      updateData[bulkEditField] = bulkEditValue;
    }

    selectedIds.forEach(id => {
      const docRef = doc(db, 'users', user.uid, 'expenses', id);
      batch.update(docRef, updateData);
    });

    try {
      await batch.commit();
      alert('一括更新が完了しました。');
      setSelectedIds([]);
      setBulkEditValue('');
    } catch (err) {
      console.error(err);
      setOpError('一括更新に失敗しました。');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedItemIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (index: number) => {
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    
    const newPaymentMethods = [...paymentMethods];
    const [removed] = newPaymentMethods.splice(draggedItemIndex, 1);
    newPaymentMethods.splice(index, 0, removed);
    
    // setPaymentMethods(newPaymentMethods); // Removed optimistic update as state is managed by hook
    setDraggedItemIndex(null);

    if (!user) return;
    const batch = writeBatch(db);
    newPaymentMethods.forEach((pm, idx) => {
      const ref = doc(db, 'users', user.uid, 'paymentMethods', pm.id);
      batch.update(ref, { order: idx });
    });
    try {
      await batch.commit();
    } catch (err) {
      console.error("Failed to reorder", err);
    }
  };

    const getStatusColor = (statusValue: string | boolean | undefined, defaultColor: string) => {
      if (!statusValue) return defaultColor;
      if (statusValue === true) {
        return checkStatuses.length > 0 ? checkStatuses[0].color : '#d4edda';
      }
      const status = checkStatuses.find(s => s.id === statusValue);
      return status ? status.color : (checkStatuses.length > 0 ? checkStatuses[0].color : '#d4edda');
    };
  
    const cycleStatus = (currentValue: string | boolean | undefined): string | boolean => {
      if (!checkStatuses || checkStatuses.length === 0) return !currentValue; // Fallback to boolean
      if (!currentValue) return checkStatuses[0].id;
      
      let currentIndex = -1;
      if (currentValue === true) currentIndex = 0;
      else currentIndex = checkStatuses.findIndex(s => s.id === currentValue);
  
      if (currentIndex === -1 || currentIndex >= checkStatuses.length - 1) {
        return false; // Turn off
      }
      return checkStatuses[currentIndex + 1].id;
    };
  
    const handleToggleAggregateCheck = async (key: string) => {
      if (!user) return;
      const monthKey = format(month, 'yyyy-MM');
      const docRef = doc(db, 'users', user.uid, 'monthlyChecks', monthKey);
      const newCheckedState = cycleStatus(aggregateChecks[key]);
  
      setAggregateChecks(prev => ({ ...prev, [key]: newCheckedState }));
  
      try {
        await setDoc(docRef, { [key]: newCheckedState }, { merge: true });
      } catch (err) {
        console.error(err);
      }
    };
    const handleCellClick = (e: React.MouseEvent<HTMLElement>, dayExpenses: Expense[], title: string, cellKey?: string) => {
      if (dayExpenses.length > 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        const popoverHeight = 300; // 推定の高さ
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
  
        let topPosition = rect.bottom;
        if (spaceAbove > popoverHeight && spaceAbove > spaceBelow) {
          topPosition = rect.top - popoverHeight;
        }
  
        const style: React.CSSProperties = {
          position: 'fixed',
          left: rect.left,
          top: `${topPosition}px`,
          zIndex: 50,
          maxHeight: `${popoverHeight}px`,
          overflowY: 'auto'
        };
        setPopover({ visible: true, expenses: dayExpenses, style, title, cellKey });
      }
    };
  if (loading) {
    return (
      <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
               <div className="space-y-2">
                 <Skeleton className="h-4 w-24" />
                 <Skeleton className="h-3 w-32" />
               </div>
               <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error || opError) return <p className="text-red-500">{error || opError}</p>;

  // Calendar View Data Processing
  const daysInMonth = getDaysInMonth(month);
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const expensesByPaymentMethod: { [key: string]: { [key: number]: Expense[] } } = {};
  const totalsByPaymentMethod: { [key: string]: number } = {};
  paymentMethods.forEach(pm => { totalsByPaymentMethod[pm.id] = 0; });
  regularExpenses.forEach(expense => {
    const day = getDate(expense.date.toDate());
    if (!expensesByPaymentMethod[expense.paymentMethodId]) expensesByPaymentMethod[expense.paymentMethodId] = {};
    if (!expensesByPaymentMethod[expense.paymentMethodId][day]) expensesByPaymentMethod[expense.paymentMethodId][day] = [];
    expensesByPaymentMethod[expense.paymentMethodId][day].push(expense);
    totalsByPaymentMethod[expense.paymentMethodId] = (totalsByPaymentMethod[expense.paymentMethodId] || 0) + expense.amount;
  });
  irregularExpenses.forEach(expense => {
    totalsByPaymentMethod[expense.paymentMethodId] = (totalsByPaymentMethod[expense.paymentMethodId] || 0) + expense.amount;
  });

  const renderBulkUpdateField = () => {
    switch (bulkEditField) {
      case 'categoryId':
        return (
          <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md">
            <option value="">カテゴリーを選択</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        );
      case 'paymentMethodId':
        return (
          <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md">
            <option value="">支払方法を選択</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        );
      case 'date':
        return <input type="date" value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md" />;
      case 'store':
      case 'memo':
        return <input type="text" value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md" placeholder="新しい値を入力" />;
      default:
        return null;
    }
  };

  const calendarStart = startOfWeek(startOfMonth(month));
  const calendarEnd = endOfWeek(endOfMonth(month));
  const calendarDays = [];
  let dayIter = calendarStart;
  while (dayIter <= calendarEnd) {
    calendarDays.push(dayIter);
    dayIter = addDays(dayIter, 1);
  }

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        {headerAction}
      </div>

      {viewMode === 'list' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border rounded-md bg-gray-50 dark:bg-gray-900">
            <input 
              type="text"
              placeholder="店名・メモで検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-md md:col-span-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={selectedPaymentMethod} onChange={e => setSelectedPaymentMethod(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md w-full">
                <option value="">すべての支払方法</option>
                {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md w-full">
                <option value="">すべてのカテゴリー</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md w-full"/>
              <span>-</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md w-full"/>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="mb-4 p-4 border rounded-md bg-yellow-50 flex items-center gap-4 flex-wrap">
              <span className="font-bold">{selectedIds.length}件選択中</span>
              <select value={bulkEditField} onChange={e => setBulkEditField(e.target.value as BulkEditField)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md">
                <option value="categoryId">カテゴリー</option>
                <option value="paymentMethodId">支払方法</option>
                <option value="store">店名</option>
                <option value="memo">メモ</option>
                <option value="date">日付</option>
              </select>
              {renderBulkUpdateField()}
              <button onClick={handleBulkUpdate} disabled={isUpdating} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300">
                {isUpdating ? '更新中...' : '一括更新'}
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox" 
                      checked={selectedIds.length > 0 && selectedIds.length === filteredExpenses.length}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">日付</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">内容</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">金額</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">支払方法</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">アクション</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-black divide-y divide-gray-200 dark:divide-gray-700">
                {filteredExpenses.map(expense => (
                  <tr key={expense.id} className={selectedIds.includes(expense.id) ? 'bg-yellow-100' : ''}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input type="checkbox"
                        checked={selectedIds.includes(expense.id)}
                        onChange={() => handleSelect(expense.id)}
                        className="h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 rounded"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{format(expense.date.toDate(), 'M/d')}</td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{expense.store || 'N/A'}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{categories.find(c=>c.id === expense.categoryId)?.name || '未分類'}</div>
                      {expense.memo && <div className="text-xs text-gray-400 mt-1">メモ: {expense.memo}</div>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">¥{expense.amount.toLocaleString()}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{paymentMethods.find(p=>p.id === expense.paymentMethodId)?.name || '不明'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                       <button onClick={() => handleCopy(expense)} className="text-green-600 hover:text-green-800 mr-2">複製</button>
                       <Link href={`/dashboard/edit-expense/${expense.id}`} className="text-blue-600 hover:text-blue-800 mr-2">編集</Link>
                       <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-800">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewMode === 'monthly_grid' && (
        <>
          <div className="grid grid-cols-7 border-t border-l border-gray-300 text-gray-900">
            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
               <div key={d} className={`p-2 border-r border-b border-gray-300 font-bold text-center bg-gray-100 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''}`}>{d}</div>
            ))}
            {calendarDays.map((date, i) => {
               // Use allMonthExpenses which now includes irregular expenses that fall in this month
               const dailyExpenses = regularExpenses.filter(e => isSameDay(e.date.toDate(), date));
               const total = dailyExpenses.reduce((sum, e) => sum + e.amount, 0);
               const isCurrentMonth = isSameMonth(date, month);
               const dayKey = format(date, 'yyyy-MM-dd');
               const isChecked = aggregateChecks[dayKey];

               return (
                 <div 
                   key={i} 
                   className={`p-2 border-r border-b border-gray-300 min-h-[100px] hover:bg-gray-50 cursor-pointer transition-colors ${!isCurrentMonth ? 'text-gray-400' : ''}`}
                   style={{ backgroundColor: getStatusColor(isChecked, 'white') }} 
                   onClick={(e) => handleCellClick(e, dailyExpenses, format(date, 'M月d日の支出'), dayKey)}
                   onDoubleClick={(e) => {
                     e.stopPropagation(); // Prevent opening popover if empty? Actually popover check checks length.
                     handleToggleAggregateCheck(dayKey);
                   }}
                 >
                   <div className={`text-right ${format(date, 'E', { locale: ja }) === '日' ? 'text-red-500' : format(date, 'E', { locale: ja }) === '土' ? 'text-blue-500' : ''}`}>
                     {format(date, 'd')}
                   </div>
                   {total > 0 && <div className="text-sm font-bold text-red-600 mt-2 text-right">¥{total.toLocaleString()}</div>}
                   <div className="mt-1 space-y-1">
                     {dailyExpenses.slice(0, 3).map(exp => (
                       <div key={exp.id} className="text-xs truncate text-gray-600 bg-gray-100 rounded px-1">{exp.store || '支出'}</div>
                     ))}
                     {dailyExpenses.length > 3 && <div className="text-xs text-gray-400 text-center">他{dailyExpenses.length - 3}件</div>}
                   </div>
                 </div>
               );
            })}
          </div>
          
          {/* Irregular expenses section for grid view */}
          {irregularExpenses.length > 0 && (
            <div
              className="mt-6 border border-gray-300 rounded-lg overflow-hidden transition-colors"
              style={{ backgroundColor: getStatusColor(aggregateChecks['grid_irregular_total'], '#fefce8') }}
            >
              <div className="p-3 border-b border-gray-300 flex justify-between items-center cursor-pointer"
                   onClick={(e) => handleCellClick(e, irregularExpenses, `${format(month, 'M月')}のイレギュラー支出`, 'grid_irregular_total')}
                   onDoubleClick={() => handleToggleAggregateCheck('grid_irregular_total')}
                   style={{ backgroundColor: getStatusColor(aggregateChecks['grid_irregular_total'], '#fefce8') }}>
                <h3 className="font-bold text-yellow-800">イレギュラー支出 (月合計に含まれます)</h3>
                <p className="font-bold text-red-600">¥{irregularExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}</p>
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {irregularExpenses.map(exp => (
                  <div key={exp.id} className="text-sm border p-2 rounded flex justify-between bg-gray-50">
                    <span className="truncate mr-2">{exp.store || 'N/A'}</span>
                    <span className="font-semibold shrink-0">¥{exp.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === 'calendar' && (
        // Calendar View JSX (unchanged)
        <div className="overflow-x-auto relative z-0 text-gray-900">
          <table className="min-w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr className="bg-gray-100">
                <th style={{ border: '1px solid #A9A9A9', padding: '8px', position: 'sticky', left: 0, backgroundColor: '#F3F4F6', zIndex: 10 }}>支払方法</th>
                {monthDays.map(day => {
                  const date = new Date(month.getFullYear(), month.getMonth(), day);
                  const dayOfWeek = format(date, 'E', { locale: ja });
                  const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';
                  return (
                    <th key={day} style={{ border: '1px solid #A9A9A9', padding: '8px', textAlign: 'center', color: isWeekend ? 'red' : 'inherit' }}>
                      <div>{day}</div>
                      <div>({dayOfWeek})</div>
                    </th>
                  );
                })}
                <th style={{ border: '1px solid #A9A9A9', padding: '8px', textAlign: 'center' }}>イレギュラー</th>
                <th style={{ border: '1px solid #A9A9A9', padding: '8px', position: 'sticky', right: 0, backgroundColor: '#F3F4F6', zIndex: 10 }}>合計</th>
              </tr>
            </thead>
            <tbody>
              {paymentMethods.map((pm, index) => {
                const pmIrregularExpenses = irregularExpenses.filter(exp => exp.paymentMethodId === pm.id);
                const irregularTotal = pmIrregularExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                
                const irregularKey = `${pm.id}_irregular`;
                const totalKey = `${pm.id}_total`;
                const isIrregularChecked = aggregateChecks[irregularKey];
                const isTotalChecked = aggregateChecks[totalKey];

                return (
                  <tr 
                    key={pm.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    className="cursor-move hover:bg-gray-50 transition-colors"
                  >
                    <td style={{ border: '1px solid #A9A9A9', padding: '8px', fontWeight: '600', position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 10 }}>{pm.name}</td>
                    {monthDays.map(day => {
                      const dayExpenses = expensesByPaymentMethod[pm.id]?.[day] || [];
                      const cellTotal = dayExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                      const allChecked = dayExpenses.length > 0 && dayExpenses.every(exp => exp.isChecked);

                      const dateObj = new Date(month.getFullYear(), month.getMonth(), day);
                      const cellKey = `${pm.id}_${format(dateObj, 'yyyy-MM-dd')}`;

                      const hasAggregate = typeof aggregateChecks[cellKey] !== 'undefined';
                      let backgroundColor = 'white';
                      if (hasAggregate) {
                        const aggVal = aggregateChecks[cellKey];
                        backgroundColor = aggVal ? getStatusColor(aggVal, 'white') : 'white';
                      } else {
                        const firstStatus = dayExpenses.length > 0 ? (dayExpenses[0].checkStatusId || (dayExpenses[0].isChecked ? 'default' : undefined)) : undefined;
                        const allSameStatus = dayExpenses.length > 0 && dayExpenses.every(exp => (exp.checkStatusId || (exp.isChecked ? 'default' : undefined)) === firstStatus);
                        if (allChecked && allSameStatus && firstStatus) {
                          backgroundColor = getStatusColor(firstStatus, 'white');
                        } else {
                          backgroundColor = 'white';
                        }
                      }

                      const cellStyle: React.CSSProperties = { 
                        border: '1px solid #A9A9A9', 
                        padding: '8px', 
                        verticalAlign: 'top', 
                        minWidth: '120px', 
                        cursor: dayExpenses.length > 0 ? 'pointer' : 'default',
                        backgroundColor
                      };
                      return (
                        <td key={day} style={cellStyle} onClick={(e) => handleCellClick(e, dayExpenses, `${format(month, 'M月')}${day}日の支出`, cellKey)} onDoubleClick={(e) => { e.stopPropagation(); handleToggleAggregateCheck(cellKey); }}>
                          {dayExpenses.length === 1 && <div className="text-xs text-center p-1 bg-blue-100 rounded"><p className="font-semibold">¥{dayExpenses[0].amount.toLocaleString()}</p></div>}
                          {dayExpenses.length > 1 && <div className="text-xs p-1 bg-purple-100 rounded"><p className="font-bold text-center">合計: ¥{cellTotal.toLocaleString()}</p><p className="text-center">({dayExpenses.length}件)</p></div>}
                        </td>
                      );
                    })}
                    <td 
                      style={{ 
                        border: '1px solid #A9A9A9', 
                        padding: '8px', 
                        verticalAlign: 'top', 
                        minWidth: '120px', 
                        cursor: 'pointer',
                        backgroundColor: getStatusColor(isIrregularChecked, 'white')
                      }} 
                      onClick={(e) => {
                        if (pmIrregularExpenses.length > 0) {
                          handleCellClick(e, pmIrregularExpenses, `${format(month, 'M月')}のイレギュラー支出`, irregularKey);
                        } else {
                          handleToggleAggregateCheck(irregularKey);
                        }
                      }}
                      onDoubleClick={() => handleToggleAggregateCheck(irregularKey)}
                    >
                      {pmIrregularExpenses.length > 0 && <div className="text-xs p-1 bg-yellow-100 rounded"><p className="font-bold text-center">合計: ¥{irregularTotal.toLocaleString()}</p><p className="text-center">({pmIrregularExpenses.length}件)</p></div>}
                    </td>
                    <td 
                      style={{ 
                        border: '1px solid #A9A9A9', 
                        padding: '8px', 
                        fontWeight: 'bold', 
                        textAlign: 'right', 
                        position: 'sticky', 
                        right: 0, 
                        zIndex: 10,
                        backgroundColor: getStatusColor(isTotalChecked, 'white'),
                        cursor: 'pointer'
                      }}
                      onClick={() => handleToggleAggregateCheck(totalKey)}
                    >
                      ¥{totalsByPaymentMethod[pm.id]?.toLocaleString() || 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {popover.visible && createPortal(
            <div ref={popoverRef} style={popover.style} className="p-4 rounded-lg shadow-xl border w-80 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-bold">{popover.title}</h3>
                {popover.cellKey && (
                  <select
                    value={typeof aggregateChecks[popover.cellKey] === 'string' ? aggregateChecks[popover.cellKey] as string : (aggregateChecks[popover.cellKey] ? 'default' : '')}
                    onChange={async (e) => {
                      if (!user) return;
                      const val = e.target.value;
                      const newCheckedState = val !== '' ? val : false;
                      const monthKey = format(month, 'yyyy-MM');
                      const docRef = doc(db, 'users', user.uid, 'monthlyChecks', monthKey);
                      
                      setAggregateChecks(prev => ({ ...prev, [popover.cellKey!]: newCheckedState }));
                      try {
                        await setDoc(docRef, { [popover.cellKey!]: newCheckedState }, { merge: true });
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="text-xs border border-gray-400 dark:border-gray-600 rounded cursor-pointer py-1 px-2 text-gray-900 font-medium"
                    style={{ backgroundColor: getStatusColor(aggregateChecks[popover.cellKey], 'transparent') }}
                  >
                    <option value="" style={{ backgroundColor: 'white' }}>未確認 (全体)</option>
                    {checkStatuses.map(s => (
                      <option key={s.id} value={s.id} style={{ backgroundColor: s.color }}>{s.label}</option>
                    ))}
                  </select>
                )}
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-60 overflow-y-auto">
                {popover.expenses.map(expense => (
                  <li key={expense.id} className="py-2">
                    <div className="flex justify-between items-center">
                      <div className="flex-grow">
                        <div className="flex items-center">
                          <select
                            value={expense.checkStatusId || (expense.isChecked ? 'default' : '')}
                            onChange={async (e) => {
                              if (!user) return;
                              const val = e.target.value;
                              const newIsChecked = val !== '';
                              const newCheckStatusId = val !== '' ? val : null;

                              const updated = popover.expenses.map(exp => exp.id === expense.id ? { ...exp, isChecked: newIsChecked, checkStatusId: newCheckStatusId } : exp);
                              setPopover(prev => ({ ...prev, expenses: updated }));
                              
                              try {
                                await updateDoc(doc(db, 'users', user.uid, 'expenses', expense.id), { isChecked: newIsChecked, checkStatusId: newCheckStatusId });
                              } catch(err) {
                                console.error(err);
                                setOpError('状態の更新に失敗しました。');
                                setPopover(prev => ({ ...prev, expenses: popover.expenses }));
                              }
                            }}
                            className="text-xs border border-gray-400 dark:border-gray-600 rounded mr-3 cursor-pointer flex-shrink-0 py-1 text-gray-900 font-medium"
                            style={{ backgroundColor: getStatusColor(expense.checkStatusId || (expense.isChecked ? 'default' : ''), 'transparent') }}
                          >
                            <option value="" style={{ backgroundColor: 'white' }}>未確認</option>
                            {checkStatuses.map(s => (
                              <option key={s.id} value={s.id} style={{ backgroundColor: s.color }}>{s.label}</option>
                            ))}
                          </select>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">¥{expense.amount.toLocaleString()}</p>
                            <p className="text-xs text-gray-900 dark:text-gray-100">{expense.store || 'N/A'}</p>
                            <p className="text-xs text-gray-900 dark:text-gray-100">{categories.find(c=>c.id === expense.categoryId)?.name || '未分類'} / {paymentMethods.find(p=>p.id === expense.paymentMethodId)?.name || '不明'}</p>
                            {expense.memo && <p className="text-xs text-gray-900 dark:text-gray-100 mt-1">メモ: {expense.memo}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        <Link href={`/dashboard/edit-expense/${expense.id}`} className="text-blue-600 hover:text-blue-800 text-xs p-1">編集</Link>
                        <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-800 text-xs p-1">削除</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button onClick={() => setPopover(p => ({ ...p, visible: false }))} className="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-sm py-1 px-2 rounded text-gray-800">閉じる</button>
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
