"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, onSnapshot, where, getDocs, Timestamp, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularPayment } from '@/types/RegularPayment';
import { RegularPaymentGroup } from '@/types/RegularPaymentGroup';
import { getMonth, getYear, startOfMonth, endOfMonth, addMonths, addYears } from 'date-fns';

interface Props {
  month: Date;
}

const RegularPaymentProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularPayment[]>([]);
  const [groups, setGroups] = useState<RegularPaymentGroup[]>([]);
  const [upcomingPayments, setUpcomingPayments] = useState<RegularPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    const templatesQuery = query(collection(db, 'users', user.uid, 'regularPayments'));
    const unsubTemplates = onSnapshot(templatesQuery, (snapshot) => {
      const fetchedTemplates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RegularPayment));
      setTemplates(fetchedTemplates);
      setLoading(false);
    }, err => {
      console.error(err);
      setError('テンプレートの読み込みに失敗しました。');
      setLoading(false);
    });

    const groupsQuery = query(collection(db, 'users', user.uid, 'regularPaymentGroups'), orderBy('name'));
    const unsubGroups = onSnapshot(groupsQuery, (snapshot) => {
      const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RegularPaymentGroup));
      setGroups(fetchedGroups);
    }, err => {
      console.error(err);
    });

    return () => {
      unsubTemplates();
      unsubGroups();
    };
  }, [user, authLoading]);

  useEffect(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);

    const upcoming = templates.filter(t => {
      if (!t.nextPaymentDate) return false;
      const nextPaymentDate = t.nextPaymentDate.toDate();
      return nextPaymentDate >= start && nextPaymentDate <= end;
    });

    setUpcomingPayments(upcoming);
  }, [templates, month]);

  const handleRecordExpense = async (template: RegularPayment) => {
    if (!user) return;

    const expenseDate = template.nextPaymentDate.toDate();

    try {
      // Check if an expense has already been recorded for this specific payment date
      const q = query(
        collection(db, 'users', user.uid, 'expenses'),
        where('regularPaymentId', '==', template.id),
        where('date', '==', Timestamp.fromDate(expenseDate))
      );
      const existing = await getDocs(q);
      if (!existing.empty) {
        alert('この支出は既に記録されています。');
        return;
      }

      // Add the expense
      await addDoc(collection(db, 'users', user.uid, 'expenses'), {
        date: Timestamp.fromDate(expenseDate),
        amount: template.amount,
        categoryId: template.categoryId,
        paymentMethodId: template.paymentMethodId,
        store: template.name,
        memo: '定期支出からの自動記録',
        regularPaymentId: template.id,
        isChecked: false,
      });

      // Calculate the next payment date
      let newNextPaymentDate;
      if (template.frequency === 'months') {
        newNextPaymentDate = addMonths(expenseDate, template.interval);
      } else { // years
        newNextPaymentDate = addYears(expenseDate, template.interval);
      }

      // Update the regular payment with the new next payment date
      const paymentRef = doc(db, 'users', user.uid, 'regularPayments', template.id);
      await updateDoc(paymentRef, {
        nextPaymentDate: Timestamp.fromDate(newNextPaymentDate)
      });

      alert(`${template.name} を支出として記録しました。`);
    } catch (err) {
      console.error(err);
      alert('支出の記録に失敗しました。');
    }
  };

  const handleToggleCheck = async (payment: RegularPayment) => {
    if (!user) return;
    const paymentRef = doc(db, 'users', user.uid, 'regularPayments', payment.id);
    try {
      await updateDoc(paymentRef, { isChecked: !payment.isChecked });
    } catch (err) {
      console.error(err);
      setError('チェック状態の更新に失敗しました。');
    }
  };

  if (loading) return <p>読み込み中...</p>;

  // Calculate totals and group items
  const totalAmount = upcomingPayments.reduce((sum, t) => sum + t.amount, 0);

  const groupedPayments = new Map<string, RegularPayment[]>();
  const noGroupPayments: RegularPayment[] = [];

  upcomingPayments.forEach(t => {
    if (t.groupId && groups.some(g => g.id === t.groupId)) {
      if (!groupedPayments.has(t.groupId)) groupedPayments.set(t.groupId, []);
      groupedPayments.get(t.groupId)!.push(t);
    } else {
      noGroupPayments.push(t);
    }
  });

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">今月の定期支出</h2>
        <p className="text-lg font-bold text-gray-700 dark:text-gray-200">合計: ¥{totalAmount.toLocaleString()}</p>
      </div>
      {error && <p className="text-red-500">{error}</p>}
      {upcomingPayments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">今月支払う予定の定期支出はありません。</p>
      ) : (
        <div className="space-y-6">
          {groups.map(g => {
            const payments = groupedPayments.get(g.id);
            if (!payments || payments.length === 0) return null;
            const groupTotal = payments.reduce((sum, p) => sum + p.amount, 0);

            return (
              <div key={g.id} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 font-bold text-gray-700 dark:text-gray-200 border-b flex justify-between items-center">
                  <span>{g.name}</span>
                  <span className="text-sm">小計: ¥{groupTotal.toLocaleString()}</span>
                </div>
                <ul className="divide-y">
                  {payments.map(template => (
                    <PaymentItem key={template.id} template={template} onToggleCheck={handleToggleCheck} onRecord={handleRecordExpense} />
                  ))}
                </ul>
              </div>
            );
          })}

          {noGroupPayments.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
               <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 font-bold text-gray-700 dark:text-gray-200 border-b flex justify-between items-center">
                  <span>グループなし</span>
                  <span className="text-sm">小計: ¥{noGroupPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}</span>
                </div>
              <ul className="divide-y">
                {noGroupPayments.map(template => (
                  <PaymentItem key={template.id} template={template} onToggleCheck={handleToggleCheck} onRecord={handleRecordExpense} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PaymentItem = ({ template, onToggleCheck, onRecord }: { template: RegularPayment, onToggleCheck: (t: RegularPayment) => void, onRecord: (t: RegularPayment) => void }) => {
  const textStyle = template.isChecked ? { color: 'red' } : {};
  const paymentDate = template.nextPaymentDate.toDate();
  return (
    <li style={textStyle} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:bg-gray-900 bg-white dark:bg-black">
      <div>
        <p className="font-semibold">{template.name}</p>
        <p className="text-sm">
          {paymentDate.toLocaleDateString()} - ¥{template.amount.toLocaleString()}
        </p>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onToggleCheck(template)}
          className={`text-sm font-medium px-2 py-1 rounded ${template.isChecked ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}`}
        >
          {template.isChecked ? '✔' : 'チェック'}
        </button>
        <button
          onClick={() => onRecord(template)}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-sm"
        >
          記録する
        </button>
      </div>
    </li>
  );
};

export default RegularPaymentProcessor;
