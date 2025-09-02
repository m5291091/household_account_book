"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, onSnapshot, where, getDocs, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularPayment } from '@/types/RegularPayment';
import { getMonth, getYear, startOfMonth, endOfMonth, addMonths, addYears } from 'date-fns';

interface Props {
  month: Date;
}

const RegularPaymentProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularPayment[]>([]);
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

    return () => {
      unsubTemplates();
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

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">今月の定期支出</h2>
      {error && <p className="text-red-500">{error}</p>}
      {upcomingPayments.length === 0 ? (
        <p className="text-gray-500">今月支払う予定の定期支出はありません。</p>
      ) : (
        <ul className="space-y-3">
          {upcomingPayments.map(template => {
            const textStyle = template.isChecked ? { color: 'red' } : {};
            const paymentDate = template.nextPaymentDate.toDate();
            return (
              <li key={template.id} style={textStyle} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div>
                  <p className="font-semibold">{template.name}</p>
                  <p className="text-sm">
                    {paymentDate.toLocaleDateString()} - ¥{template.amount.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleToggleCheck(template)}
                    className={`text-sm font-medium px-2 py-1 rounded ${template.isChecked ? 'bg-red-500 text-white' : 'bg-gray-200'}`}
                  >
                    {template.isChecked ? '✔' : 'チェック'}
                  </button>
                  <button
                    onClick={() => handleRecordExpense(template)}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-sm"
                  >
                    記録する
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RegularPaymentProcessor;
