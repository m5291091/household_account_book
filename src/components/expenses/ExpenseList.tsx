"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, orderBy, where, Timestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseFormData } from '@/types/Expense';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Category } from '@/types/Category';
import { format, startOfMonth, endOfMonth, getDaysInMonth, getDate, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { createPortal } from 'react-dom';
import Link from 'next/link';

interface ExpenseListProps {
  month: Date;
  onEditExpense: (expense: Expense) => void;
  onCopyExpense: (data: Partial<ExpenseFormData>) => void;
}

interface PopoverState {
  visible: boolean;
  expenses: Expense[];
  style: React.CSSProperties;
  title: string;
}

type BulkEditField = 'categoryId' | 'paymentMethodId' | 'store' | 'memo' | 'date';

const ExpenseList = ({ month, onEditExpense, onCopyExpense }: ExpenseListProps) => {
  const { user, loading: authLoading } = useAuth();
  const [allMonthExpenses, setAllMonthExpenses] = useState<Expense[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState>({ visible: false, expenses: [], style: {}, title: '' });
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Filtering and Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Bulk update states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkEditField, setBulkEditField] = useState<BulkEditField>('categoryId');
  const [bulkEditValue, setBulkEditValue] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);


  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'), orderBy('name'));
    const unsubPaymentMethods = onSnapshot(pmQuery, (snapshot) => {
      setPaymentMethods(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod)));
    });

    const catQuery = query(collection(db, 'users', user.uid, 'categories'), orderBy('name'));
    const unsubCategories = onSnapshot(catQuery, (snapshot) => {
      setCategories(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    });

    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const expensesQuery = query(
      collection(db, 'users', user.uid, 'expenses'),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd)),
      orderBy('date', 'desc')
    );
    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setAllMonthExpenses(expenses);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('支出履歴の読み込みに失敗しました。');
      setLoading(false);
    });

    return () => {
      unsubPaymentMethods();
      unsubCategories();
      unsubExpenses();
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

      const expenseDate = expense.date.toDate();
      const startMatch = !startDate || expenseDate >= parseISO(startDate);
      const endMatch = !endDate || expenseDate <= parseISO(`${endDate}T23:59:59`);
      
      return searchMatch && paymentMethodMatch && startMatch && endMatch;
    });
  }, [allMonthExpenses, searchQuery, selectedPaymentMethod, startDate, endDate]);

  const regularExpenses = useMemo(() => filteredExpenses.filter(exp => !exp.isIrregular), [filteredExpenses]);
  const irregularExpenses = useMemo(() => filteredExpenses.filter(exp => exp.isIrregular), [filteredExpenses]);

  const handleDelete = async (id: string) => {
    if (!user || !confirm('この支出を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
      setPopover(p => ({ ...p, visible: false }));
    } catch (err) { console.error(err); setError('支出の削除に失敗しました。'); }
  };
  
  const handleToggleCheck = async (expenseToToggle: Expense) => {
    if (!user) return;

    // Optimistic UI update
    const updatedExpenses = allMonthExpenses.map(exp => 
      exp.id === expenseToToggle.id ? { ...exp, isChecked: !exp.isChecked } : exp
    );
    setAllMonthExpenses(updatedExpenses);

    const updatedPopoverExpenses = popover.expenses.map(exp =>
      exp.id === expenseToToggle.id ? { ...exp, isChecked: !exp.isChecked } : exp
    );
    setPopover(prev => ({ ...prev, expenses: updatedPopoverExpenses }));

    // Update Firestore
    const expenseRef = doc(db, 'users', user.uid, 'expenses', expenseToToggle.id);
    try {
      await updateDoc(expenseRef, { isChecked: !expenseToToggle.isChecked });
    } catch (err) { 
      console.error(err); 
      setError('支出のチェック状態の更新に失敗しました。');
      // Revert on error
      setAllMonthExpenses(allMonthExpenses);
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
      isIrregular: expense.isIrregular,
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
    setError(null);
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
      setError('一括更新に失敗しました。');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCellClick = (e: React.MouseEvent<HTMLTableCellElement>, dayExpenses: Expense[], title: string) => {
    if (dayExpenses.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const style: React.CSSProperties = { position: 'fixed', left: rect.left, top: rect.bottom, zIndex: 50, backgroundColor: 'white' };
      setPopover({ visible: true, expenses: dayExpenses, style, title });
    }
  };

  if (loading) return <p>履歴を読み込んでいます...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

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
          <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 rounded-md">
            <option value="">カテゴリーを選択</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        );
      case 'paymentMethodId':
        return (
          <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 rounded-md">
            <option value="">支払方法を選択</option>
            {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        );
      case 'date':
        return <input type="date" value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 rounded-md" />;
      case 'store':
      case 'memo':
        return <input type="text" value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} className="p-2 border border-gray-300 rounded-md" placeholder="新しい値を入力" />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">支出履歴</h2>
        <div className="flex space-x-2">
          <button onClick={() => setViewMode('calendar')} className={`px-3 py-1 text-sm font-medium rounded-md ${viewMode === 'calendar' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>カレンダー</button>
          <button onClick={() => setViewMode('list')} className={`px-3 py-1 text-sm font-medium rounded-md ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>リスト</button>
        </div>
      </div>

      {viewMode === 'list' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border rounded-md bg-gray-50">
            <input 
              type="text"
              placeholder="店名・メモで検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="p-2 border border-gray-300 rounded-md md:col-span-2"
            />
            <select value={selectedPaymentMethod} onChange={e => setSelectedPaymentMethod(e.target.value)} className="p-2 border border-gray-300 rounded-md">
              <option value="">すべての支払方法</option>
              {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
            </select>
            <div className="flex items-center space-x-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full"/>
              <span>-</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full"/>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="mb-4 p-4 border rounded-md bg-yellow-50 flex items-center gap-4 flex-wrap">
              <span className="font-bold">{selectedIds.length}件選択中</span>
              <select value={bulkEditField} onChange={e => setBulkEditField(e.target.value as BulkEditField)} className="p-2 border border-gray-300 rounded-md">
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input type="checkbox" 
                      checked={selectedIds.length > 0 && selectedIds.length === filteredExpenses.length}
                      onChange={handleSelectAll}
                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日付</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">内容</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">支払方法</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">アクション</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredExpenses.map(expense => (
                  <tr key={expense.id} className={selectedIds.includes(expense.id) ? 'bg-yellow-100' : ''}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input type="checkbox"
                        checked={selectedIds.includes(expense.id)}
                        onChange={() => handleSelect(expense.id)}
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{format(expense.date.toDate(), 'M/d')}</td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">{expense.store || 'N/A'}</div>
                      <div className="text-sm text-gray-500">{categories.find(c=>c.id === expense.categoryId)?.name || '未分類'}</div>
                      {expense.memo && <div className="text-xs text-gray-400 mt-1">メモ: {expense.memo}</div>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">¥{expense.amount.toLocaleString()}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{paymentMethods.find(p=>p.id === expense.paymentMethodId)?.name || '不明'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                       <button onClick={() => handleCopy(expense)} className="text-green-600 hover:text-green-800 mr-2">複製</button>
                       <button onClick={() => onEditExpense(expense)} className="text-blue-600 hover:text-blue-800 mr-2">編集</button>
                       <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-800">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewMode === 'calendar' && (
        // Calendar View JSX (unchanged)
        <div className="overflow-x-auto relative z-0">
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
              {paymentMethods.map(pm => {
                const pmIrregularExpenses = irregularExpenses.filter(exp => exp.paymentMethodId === pm.id);
                const irregularTotal = pmIrregularExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                return (
                  <tr key={pm.id}>
                    <td style={{ border: '1px solid #A9A9A9', padding: '8px', fontWeight: '600', position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 10 }}>{pm.name}</td>
                    {monthDays.map(day => {
                      const dayExpenses = expensesByPaymentMethod[pm.id]?.[day] || [];
                      const cellTotal = dayExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                      const allChecked = dayExpenses.length > 0 && dayExpenses.every(exp => exp.isChecked);
                      const cellStyle: React.CSSProperties = { 
                        border: '1px solid #A9A9A9', 
                        padding: '8px', 
                        verticalAlign: 'top', 
                        minWidth: '120px', 
                        cursor: dayExpenses.length > 0 ? 'pointer' : 'default',
                        backgroundColor: allChecked ? '#d4edda' : 'transparent' // 蛍光色のような緑色
                      };
                      return (
                        <td key={day} style={cellStyle} onClick={(e) => handleCellClick(e, dayExpenses, `${format(month, 'M月')}${day}日の支出`)}>
                          {dayExpenses.length === 1 && <div className="text-xs text-center p-1 bg-blue-100 rounded"><p className="font-semibold">¥{dayExpenses[0].amount.toLocaleString()}</p></div>}
                          {dayExpenses.length > 1 && <div className="text-xs p-1 bg-purple-100 rounded"><p className="font-bold text-center">合計: ¥{cellTotal.toLocaleString()}</p><p className="text-center">({dayExpenses.length}件)</p></div>}
                        </td>
                      );
                    })}
                    <td style={{ border: '1px solid #A9A9A9', padding: '8px', verticalAlign: 'top', minWidth: '120px', cursor: pmIrregularExpenses.length > 0 ? 'pointer' : 'default' }} onClick={(e) => handleCellClick(e, pmIrregularExpenses, `${format(month, 'M月')}のイレギュラー支出`)}>
                      {pmIrregularExpenses.length > 0 && <div className="text-xs p-1 bg-yellow-100 rounded"><p className="font-bold text-center">合計: ¥{irregularTotal.toLocaleString()}</p><p className="text-center">({pmIrregularExpenses.length}件)</p></div>}
                    </td>
                    <td style={{ border: '1px solid #A9A9A9', padding: '8px', fontWeight: 'bold', textAlign: 'right', position: 'sticky', right: 0, backgroundColor: 'white', zIndex: 10 }}>¥{totalsByPaymentMethod[pm.id]?.toLocaleString() || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {popover.visible && createPortal(
            <div ref={popoverRef} style={popover.style} className="p-4 rounded-lg shadow-xl border w-80">
              <h3 className="text-md font-bold mb-2">{popover.title}</h3>
              <ul className="divide-y divide-gray-200 max-h-60 overflow-y-auto">
                {popover.expenses.map(expense => (
                  <li key={expense.id} className="py-2">
                    <div className="flex justify-between items-center">
                      <div className="flex-grow">
                        <div className="flex items-center">
                          <input type="checkbox" checked={!!expense.isChecked} onChange={() => handleToggleCheck(expense)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded mr-2"/>
                          <div>
                            <p className="text-sm font-semibold">¥{expense.amount.toLocaleString()}</p>
                            <p className="text-xs text-gray-600">{expense.store || 'N/A'}</p>
                            <p className="text-xs text-gray-500">{categories.find(c=>c.id === expense.categoryId)?.name || '未分類'} / {paymentMethods.find(p=>p.id === expense.paymentMethodId)?.name || '不明'}</p>
                            {expense.memo && <p className="text-xs text-gray-400 mt-1">メモ: {expense.memo}</p>}
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
              <button onClick={() => setPopover(p => ({ ...p, visible: false }))} className="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-sm py-1 px-2 rounded">閉じる</button>
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
