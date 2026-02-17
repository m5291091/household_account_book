"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, onSnapshot, where, getDocs, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { RegularIncome } from '@/types/RegularIncome';
import { startOfMonth, endOfMonth, addMonths, addYears } from 'date-fns';

interface Props {
  month: Date;
}

const RegularIncomeProcessor = ({ month }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<RegularIncome[]>([]);
  const [upcomingIncomes, setUpcomingIncomes] = useState<RegularIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    const templatesQuery = query(collection(db, 'users', user.uid, 'regularIncomes'));
    const unsubTemplates = onSnapshot(templatesQuery, (snapshot) => {
      const fetchedTemplates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RegularIncome));
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

    setUpcomingIncomes(upcoming);
  }, [templates, month]);

  const handleRecordIncome = async (template: RegularIncome) => {
    if (!user) return;

    const incomeDate = template.nextPaymentDate.toDate();

    try {
      // Check if an income has already been recorded for this specific payment date
      // Note: Assuming we add a 'regularIncomeId' field to income docs to track this, 
      // similar to expenses. If 'regularIncomeId' doesn't exist in Income type, 
      // we might need to add it or rely on other fields, but adding it is safer.
      // For now, let's assume we can add it as extra metadata even if not in strict type locally if Firestore allows flexible schema.
      const q = query(
        collection(db, 'users', user.uid, 'incomes'),
        where('regularIncomeId', '==', template.id),
        where('date', '==', Timestamp.fromDate(incomeDate))
      );
      const existing = await getDocs(q);
      if (!existing.empty) {
        alert('この収入は既に記録されています。');
        return;
      }

      // Add the income
      await addDoc(collection(db, 'users', user.uid, 'incomes'), {
        date: Timestamp.fromDate(incomeDate),
        amount: template.amount,
        category: template.category,
        source: template.name, // Mapping template name to source
        memo: '定期収入からの自動記録',
        regularIncomeId: template.id,
      });

      // Calculate the next payment date
      let newNextPaymentDate;
      if (template.frequency === 'months') {
        newNextPaymentDate = addMonths(incomeDate, template.interval);
      } else { // years
        newNextPaymentDate = addYears(incomeDate, template.interval);
      }

      // Update the regular income with the new next payment date
      const incomeRef = doc(db, 'users', user.uid, 'regularIncomes', template.id);
      await updateDoc(incomeRef, {
        nextPaymentDate: Timestamp.fromDate(newNextPaymentDate)
      });

      alert(`${template.name} を収入として記録しました。`);
    } catch (err) {
      console.error(err);
      alert('収入の記録に失敗しました。');
    }
  };

  if (loading) return <p>読み込み中...</p>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">今月の定期収入</h2>
      {error && <p className="text-red-500">{error}</p>}
      {upcomingIncomes.length === 0 ? (
        <p className="text-gray-500">今月受け取る予定の定期収入はありません。</p>
      ) : (
        <ul className="space-y-3">
          {upcomingIncomes.map(template => {
            const paymentDate = template.nextPaymentDate.toDate();
            return (
              <li key={template.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div>
                  <p className="font-semibold">{template.name}</p>
                  <p className="text-sm">
                    {paymentDate.toLocaleDateString()} - ¥{template.amount.toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRecordIncome(template)}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-sm"
                >
                  記録する
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default RegularIncomeProcessor;
