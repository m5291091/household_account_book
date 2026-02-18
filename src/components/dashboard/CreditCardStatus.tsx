"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Account } from '@/types/Account';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Expense } from '@/types/Expense';
import { addMonths, subMonths, setDate, endOfMonth, startOfDay, isBefore, isAfter } from 'date-fns';

type CardPaymentInfo = {
  cardId: string;
  cardName: string;
  paymentDate: Date;
  amount: number;
  linkedBankAccountId: string | null;
  billingStartDate: Date;
  billingEndDate: Date;
};

const CreditCardStatus = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creditCards, setCreditCards] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Map<string, Account>>(new Map());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const accQuery = query(collection(db, 'users', user.uid, 'accounts'));
        const accSnapshot = await getDocs(accQuery);
        const allAccounts = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
        
        const ccList = allAccounts.filter(a => a.type === 'credit_card');
        setCreditCards(ccList);
        
        const bankMap = new Map<string, Account>();
        allAccounts.filter(a => a.type === 'bank').forEach(a => bankMap.set(a.id, a));
        setBankAccounts(bankMap);

        const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
        const pmSnapshot = await getDocs(pmQuery);
        const pmList = pmSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentMethod));
        setPaymentMethods(pmList);

        const fourMonthsAgo = subMonths(new Date(), 4);
        const expQuery = query(
          collection(db, 'users', user.uid, 'expenses'),
          where('date', '>=', Timestamp.fromDate(fourMonthsAgo))
        );
        const expSnapshot = await getDocs(expQuery);
        const expList = expSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
        setExpenses(expList);

      } catch (err) {
        console.error("Error fetching credit card status data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const cardPayments = useMemo(() => {
    const today = startOfDay(new Date());

    return creditCards.map(card => {
      const closingDay = card.closingDay || 99;
      const paymentDay = card.paymentDay || 27;
      const offset = card.paymentMonthOffset ?? 1;

      const linkedMethodIds = paymentMethods
        .filter(pm => pm.linkedAccountId === card.id)
        .map(pm => pm.id);

      if (linkedMethodIds.length === 0) return null;

      // Find Next Payment Date
      let candidates = [];
      for (let i = 0; i <= 2; i++) {
        const d = addMonths(today, i);
        let payDate;
        if (paymentDay === 99) {
            payDate = endOfMonth(d);
        } else {
            const lastDay = endOfMonth(d).getDate();
            const dayToSet = Math.min(paymentDay, lastDay);
            payDate = setDate(d, dayToSet);
        }
        payDate = startOfDay(payDate);
        if (payDate >= today) {
            candidates.push(payDate);
        }
      }
      
      const nextPaymentDate = candidates[0]; 
      if (!nextPaymentDate) return null;

      // Calculate Billing Cycle
      const billingEndMonthDate = subMonths(nextPaymentDate, offset);
      let billingEndDate;
      if (closingDay === 99) {
        billingEndDate = endOfMonth(billingEndMonthDate);
      } else {
         const lastDay = endOfMonth(billingEndMonthDate).getDate();
         const dayToSet = Math.min(closingDay, lastDay);
         billingEndDate = setDate(billingEndMonthDate, dayToSet);
      }
      billingEndDate = startOfDay(billingEndDate);

      let billingStartDate;
      if (closingDay === 99) {
         billingStartDate = setDate(billingEndDate, 1);
      } else {
         const prevMonth = subMonths(billingEndDate, 1);
         const lastDay = endOfMonth(prevMonth).getDate();
         const dayToSet = Math.min(closingDay, lastDay);
         const prevCloseDate = setDate(prevMonth, dayToSet);
         
         billingStartDate = new Date(prevCloseDate);
         billingStartDate.setDate(prevCloseDate.getDate() + 1);
      }
      billingStartDate = startOfDay(billingStartDate);

      const cycleExpenses = expenses.filter(exp => {
        const d = startOfDay(exp.date.toDate());
        return linkedMethodIds.includes(exp.paymentMethodId) &&
               d >= billingStartDate && 
               d <= billingEndDate;
      });

      const totalAmount = cycleExpenses.reduce((sum, e) => sum + e.amount, 0);

      return {
        cardId: card.id,
        cardName: card.name,
        paymentDate: nextPaymentDate,
        amount: totalAmount,
        linkedBankAccountId: card.linkedBankAccountId || null,
        billingStartDate,
        billingEndDate
      } as CardPaymentInfo;
    }).filter((item): item is CardPaymentInfo => item !== null);

  }, [creditCards, paymentMethods, expenses]);

  // Group by Bank Account to calculate Total Due per Bank
  const bankStatusMap = useMemo(() => {
    const map = new Map<string, { totalDue: number; balance: number; name: string }>();

    // Initialize map with bank accounts
    bankAccounts.forEach(acc => {
      map.set(acc.id, { totalDue: 0, balance: acc.balance, name: acc.name });
    });

    // Sum up dues
    cardPayments.forEach(cp => {
      if (cp.linkedBankAccountId && map.has(cp.linkedBankAccountId)) {
        const current = map.get(cp.linkedBankAccountId)!;
        current.totalDue += cp.amount;
        map.set(cp.linkedBankAccountId, current);
      }
    });

    return map;
  }, [bankAccounts, cardPayments]);


  if (loading) return <div className="p-4 bg-white dark:bg-black rounded-lg shadow animate-pulse h-40"></div>;
  if (cardPayments.length === 0) return null;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        カード引き落とし予定 (次回)
      </h2>
      <div className="space-y-4">
        {cardPayments.sort((a,b) => a.paymentDate.getTime() - b.paymentDate.getTime()).map((cp) => {
          const bankStatus = cp.linkedBankAccountId ? bankStatusMap.get(cp.linkedBankAccountId) : null;
          // Logic: If bank status total due > balance, this specific card is "at risk" partially?
          // Or just show general bank status?
          // Let's show: "Bank Balance: X. Total Due from (A+B): Y. Shortage: Z."
          
          const isSafe = bankStatus ? bankStatus.balance >= bankStatus.totalDue : false;
          const shortage = bankStatus ? bankStatus.totalDue - bankStatus.balance : 0;

          return (
            <div key={cp.cardId} className={`border-l-4 p-4 rounded bg-gray-50 dark:bg-gray-900 ${!bankStatus || isSafe ? 'border-green-500' : 'border-red-500'}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{cp.cardName}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    引き落とし日: <span className="font-bold">{cp.paymentDate.toLocaleDateString()}</span>
                  </p>
                  <p className="text-xs text-gray-400">
                    ({cp.billingStartDate.toLocaleDateString().slice(5)} ~ {cp.billingEndDate.toLocaleDateString().slice(5)}利用分)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">¥{cp.amount.toLocaleString()}</p>
                </div>
              </div>

              {bankStatus ? (
                <div className="text-sm pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                   <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-600 dark:text-gray-300 font-bold">{bankStatus.name}</span>
                      <span className="text-gray-600 dark:text-gray-300">残高: ¥{bankStatus.balance.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        (口座引落予定総額: ¥{bankStatus.totalDue.toLocaleString()})
                      </span>
                      {isSafe ? (
                         <span className="text-green-600 font-bold text-xs flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                            資金OK
                         </span>
                      ) : (
                         <span className="text-red-600 font-bold text-xs flex items-center">
                             <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                             残高不足 (不足: ¥{shortage.toLocaleString()})
                         </span>
                      )}
                   </div>
                </div>
              ) : (
                <p className="text-sm text-orange-500 mt-2">※引き落とし口座が未設定です</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CreditCardStatus;
