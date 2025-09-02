"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, orderBy, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseFormData } from '@/types/Expense';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Category } from '@/types/Category';
import { format, startOfMonth, endOfMonth, getDaysInMonth, getDate } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ExpenseListProps {
  month: Date;
  onEditExpense: (expense: Expense) => void;
  onCopyExpense: (data: Partial<ExpenseFormData>) => void;
}

interface PopoverState {
  visible: boolean;
  expenses: Expense[];
  top: number;
  left: number;
  title: string;
}

const ExpenseList = ({ month, onEditExpense, onCopyExpense }: ExpenseListProps) => {
  const { user, loading: authLoading } = useAuth();
  const [regularExpenses, setRegularExpenses] = useState<Expense[]>([]);
  const [irregularExpenses, setIrregularExpenses] = useState<Expense[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState>({ visible: false, expenses: [], top: 0, left: 0, title: '' });
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);

    const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
    const unsubPaymentMethods = onSnapshot(pmQuery, (snapshot) => {
      setPaymentMethods(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod)));
    });

    const catQuery = query(collection(db, 'users', user.uid, 'categories'));
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
      const allMonthExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setRegularExpenses(allMonthExpenses.filter(exp => !exp.isIrregular));
      setIrregularExpenses(allMonthExpenses.filter(exp => exp.isIrregular));
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

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPopover({ ...popover, visible: false });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popover, popoverRef]);


  const handleDelete = async (id: string) => {
    if (!user || !confirm('この支出を削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', id));
      setPopover({ ...popover, visible: false });
    } catch (err) { console.error(err); setError('支出の削除に失敗しました。'); }
  };
  
  const handleToggleCheck = async (expenseToToggle: Expense) => {
    if (!user) return;
    const expenseRef = doc(db, 'users', user.uid, 'expenses', expenseToToggle.id);
    const newCheckedStatus = !expenseToToggle.isChecked;
    try {
      await updateDoc(expenseRef, { isChecked: newCheckedStatus });
    } catch (err) { console.error(err); setError('支出のチェック状態の更新に失敗しました。'); }
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
    setPopover({ ...popover, visible: false });
    alert('支出フォームに内容をコピーしました。');
  };

  const handleCellClick = (e: React.MouseEvent<HTMLTableCellElement>, dayExpenses: Expense[], title: string) => {
    if (dayExpenses.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      setPopover({
        visible: true,
        expenses: dayExpenses,
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        title: title,
      });
    }
  };

  const allExpenses = [...regularExpenses, ...irregularExpenses].sort((a, b) => b.date.toMillis() - a.date.toMillis());
  const filteredExpenses = allExpenses.filter(expense => {
    const searchLower = searchQuery.toLowerCase();
    const storeMatch = expense.store?.toLowerCase().includes(searchLower);
    const memoMatch = expense.memo?.toLowerCase().includes(searchLower);
    return storeMatch || memoMatch;
  });

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
        <div className="mb-4">
          <input 
            type="text"
            placeholder="店名やメモで検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>
      )}

      {viewMode === 'calendar' ? (
        <div className="overflow-x-auto relative">
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
                const areAllIrregularChecked = pmIrregularExpenses.length > 0 && pmIrregularExpenses.every(exp => exp.isChecked);
                const irregularCellStyle = {
                  border: '1px solid #A9A9A9', padding: '8px', verticalAlign: 'top', minWidth: '120px',
                  cursor: pmIrregularExpenses.length > 0 ? 'pointer' : 'default',
                  backgroundColor: areAllIrregularChecked ? '#ffff99' : 'transparent'
                };

                return (
                  <tr key={pm.id}>
                    <td style={{ border: '1px solid #A9A9A9', padding: '8px', fontWeight: '600', position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 10 }}>{pm.name}</td>
                    {monthDays.map(day => {
                      const dayExpenses = expensesByPaymentMethod[pm.id]?.[day] || [];
                      const cellTotal = dayExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                      const areAllChecked = dayExpenses.length > 0 && dayExpenses.every(exp => exp.isChecked);
                      const cellStyle = {
                        border: '1px solid #A9A9A9', padding: '8px', verticalAlign: 'top', minWidth: '120px',
                        cursor: dayExpenses.length > 0 ? 'pointer' : 'default',
                        backgroundColor: areAllChecked ? '#ffff99' : 'transparent'
                      };
                      return (
                        <td key={day} style={cellStyle} onClick={(e) => handleCellClick(e, dayExpenses, `${format(month, 'M月')}${day}日の支出`)}>
                          {dayExpenses.length === 1 && <div className="text-xs text-center p-1 bg-blue-100 rounded"><p className="font-semibold">¥{dayExpenses[0].amount.toLocaleString()}</p></div>}
                          {dayExpenses.length > 1 && <div className="text-xs p-1 bg-purple-100 rounded"><p className="font-bold text-center">合計: ¥{cellTotal.toLocaleString()}</p><p className="text-center">({dayExpenses.length}件)</p></div>}
                        </td>
                      );
                    })}
                    <td style={irregularCellStyle} onClick={(e) => handleCellClick(e, pmIrregularExpenses, `${format(month, 'M月')}のイレギュラー支出`)}>
                      {pmIrregularExpenses.length > 0 && <div className="text-xs p-1 bg-yellow-100 rounded"><p className="font-bold text-center">合計: ¥{irregularTotal.toLocaleString()}</p><p className="text-center">({pmIrregularExpenses.length}件)</p></div>}
                    </td>
                    <td style={{ border: '1px solid #A9A9A9', padding: '8px', fontWeight: 'bold', textAlign: 'right', position: 'sticky', right: 0, backgroundColor: 'white', zIndex: 10 }}>¥{totalsByPaymentMethod[pm.id]?.toLocaleString() || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {popover.visible && (
            <div ref={popoverRef} style={{ position: 'absolute', top: popover.top, left: popover.left, zIndex: 50 }} className="bg-white p-4 rounded-lg shadow-xl border w-80">
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
                            <p className="text-xs text-gray-600">{expense.store || 'N/A'} ({categories.find(c=>c.id === expense.categoryId)?.name || '未分類'})</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-2">
                        <button onClick={() => { onEditExpense(expense); setPopover({ ...popover, visible: false }); }} className="text-blue-600 hover:text-blue-800 text-xs p-1">編集</button>
                        <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-800 text-xs p-1">削除</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button onClick={() => setPopover({ ...popover, visible: false })} className="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-sm py-1 px-2 rounded">閉じる</button>
            </div>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {filteredExpenses.map(expense => (
            <li key={expense.id} className="py-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">
                  {format(expense.date.toDate(), 'M月d日')} 
                  {expense.isIrregular && <span className="text-xs ml-2 text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">イレギュラー</span>}
                  - {categories.find(c=>c.id === expense.categoryId)?.name || '未分類'}
                </p>
                <p className="text-xl font-bold">¥{expense.amount.toLocaleString()}</p>
                <p className="text-sm text-gray-600">{expense.store || 'N/A'} / {paymentMethods.find(p=>p.id === expense.paymentMethodId)?.name || '不明'}</p>
                {expense.memo && <p className="text-sm text-gray-500 mt-1">メモ: {expense.memo}</p>}
              </div>
              <div className="flex items-center space-x-2">
                 <button onClick={() => handleCopy(expense)} className="text-green-600 hover:text-green-800 text-sm font-medium">複製</button>
                 <button onClick={() => onEditExpense(expense)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編集</button>
                 <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">削除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ExpenseList;
