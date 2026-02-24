"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, getDoc, orderBy, Timestamp, doc, runTransaction, deleteField, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Account } from '@/types/Account';
import { PaymentMethod } from '@/types/PaymentMethod';
import { Expense } from '@/types/Expense';
import { addMonths, subMonths, setDate, endOfMonth, startOfDay, isBefore, isAfter } from 'date-fns';
import { getNextBusinessDay } from '@/lib/dateUtils';

type CardPaymentInfo = {
  cardId: string;
  cardName: string;
  paymentDate: Date;
  amount: number;
  linkedBankAccountId: string | null;
  billingStartDate: Date;
  billingEndDate: Date;
  isFixed?: boolean;
};

const CreditCardStatus = ({ month = new Date() }: { month?: Date }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creditCards, setCreditCards] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Map<string, Account>>(new Map());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Transfer form state
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string>('');
  const [transferTo, setTransferTo] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');

  // Undo entries for recently-applied "mark as paid" actions (temporary, can be reverted)
  const [undoEntries, setUndoEntries] = useState<Array<{id:string; cardId:string; prevLastPaidDate:any; prevLastPaidApplied?:boolean|null; bankId?:string|null; prevBankBalance?:number|null; amount:number; paymentDate?:number; appliedToBank?:boolean; createdAt:number}>>([]);

  const fetchUndoEntries = async () => {
    if (!user) return;
    try {
      const actionsQ = query(
        collection(db, 'users', user.uid, 'paymentActions'),
        where('type', '==', 'card_payment'),
        where('undone', '==', false),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(actionsQ);
      const entries = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          cardId: data.cardId,
          prevLastPaidDate: data.prevLastPaidDate ?? null,
          prevLastPaidApplied: data.prevLastPaidApplied ?? null,
          bankId: data.linkedBankAccountId ?? null,
          prevBankBalance: data.prevBankBalance ?? null,
          amount: data.amount,
          paymentDate: data.paymentDate && typeof data.paymentDate.toMillis === 'function' ? data.paymentDate.toMillis() : null,
          appliedToBank: data.appliedToBank ?? (data.prevBankBalance != null),
          createdAt: data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : Date.now()
        };
      });
      setUndoEntries(entries);
    } catch (err) {
      console.error('Failed fetching undo entries', err);
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const accQuery = query(collection(db, 'users', user.uid, 'accounts'));
        const accSnapshot = await getDocs(accQuery);
        const allAccounts = accSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
        
        const ccList = allAccounts.filter(a => a.type === 'credit_card' || a.type === 'auto_debit');
        setCreditCards(ccList);
        
        const bankMap = new Map<string, Account>();
        allAccounts.filter(a => a.type === 'bank').forEach(a => bankMap.set(a.id, a));
        setBankAccounts(bankMap);

        const pmQuery = query(collection(db, 'users', user.uid, 'paymentMethods'));
        const pmSnapshot = await getDocs(pmQuery);
        const pmList = pmSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentMethod));
        setPaymentMethods(pmList);

        const fourMonthsAgo = subMonths(new Date(), 4);

        // Fetch both regular expenses by date and irregular expenses by irregularDate
        const expQueryDate = query(
          collection(db, 'users', user.uid, 'expenses'),
          where('date', '>=', Timestamp.fromDate(fourMonthsAgo))
        );
        const expSnapshotDate = await getDocs(expQueryDate);
        const expListDate = expSnapshotDate.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));

        const expQueryIrregular = query(
          collection(db, 'users', user.uid, 'expenses'),
          where('irregularDate', '>=', Timestamp.fromDate(fourMonthsAgo))
        );
        const expSnapshotIrregular = await getDocs(expQueryIrregular);
        const expListIrregular = expSnapshotIrregular.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));

        // Merge and dedupe by id
        const mergedMap = new Map<string, Expense>();
        [...expListDate, ...expListIrregular].forEach(e => mergedMap.set(e.id, e));
        const mergedExpenses = Array.from(mergedMap.values());
        setExpenses(mergedExpenses);

        // Fetch persisted undoable actions
        await fetchUndoEntries();

      } catch (err) {
        console.error("Error fetching credit card status data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleMarkPaid = async (cp: CardPaymentInfo) => {
    if (!user) return;
    if (!confirm(`${cp.cardName}の今月分（${cp.amount.toLocaleString()}円）をチェックしますか？`)) return;
    const applyBalance = confirm('連携口座の残高も更新しますか？\nOK: はい（残高を更新） / キャンセル: いいえ（チェックのみ、残高は変更しない）');
    const appliedToBank = !!applyBalance;

    // Pre-check linked bank only if we will update bank balance
    if (appliedToBank) {
      if (cp.linkedBankAccountId) {
        const bank = bankAccounts.get(cp.linkedBankAccountId);
        if (!bank) {
          const proceed = confirm('連携口座が見つかりませんでした。支払いは記録しますが、残高更新は行いません。続行しますか？');
          if (!proceed) return;
        } else {
          const currentBalance = bank.balance || 0;
          if (currentBalance < cp.amount) {
            const proceed = confirm(`${bank.name}の残高が不足しています（残高: ¥${currentBalance.toLocaleString()}、引き落とし: ¥${cp.amount.toLocaleString()}）。残高をマイナスで更新して続行しますか？`);
            if (!proceed) return;
          }
        }
      }
    }

    // Save previous state for rollback if needed
    const prevCreditCards = creditCards.map(c => ({ ...c }));
    const prevBankAccounts = new Map(bankAccounts);

    // Capture previous values for undo
    const cardPrev = creditCards.find(c => c.id === cp.cardId);
    const prevLastPaidDate = cardPrev?.lastPaidDate ?? null;
    const prevLastPaidApplied = (cardPrev as any)?.lastPaidAppliedToBank ?? null;
    const prevBankBalance = appliedToBank && cp.linkedBankAccountId ? (bankAccounts.get(cp.linkedBankAccountId)?.balance ?? null) : null;

    // Optimistic UI update (apply immediately like transfer does)
    setCreditCards(prev => prev.map(c => c.id === cp.cardId ? { ...c, lastPaidDate: Timestamp.fromDate(cp.paymentDate), lastPaidAppliedToBank: appliedToBank } : c));
    if (appliedToBank && cp.linkedBankAccountId) {
      setBankAccounts(prev => {
        const newMap = new Map(prev);
        const bank = newMap.get(cp.linkedBankAccountId!);
        if (bank) newMap.set(cp.linkedBankAccountId!, { ...bank, balance: (bank.balance || 0) - cp.amount });
        return newMap;
      });
    }

    try {
      // Create action document and perform updates atomically in a single transaction
      const actionId = await runTransaction(db, async (transaction) => {
        const cardRef = doc(db, 'users', user.uid, 'accounts', cp.cardId);
        const bankRef = cp.linkedBankAccountId ? doc(db, 'users', user.uid, 'accounts', cp.linkedBankAccountId) : null;

        // Read all docs first (Firestore requires reads before writes in a transaction)
        const cardSnap = await transaction.get(cardRef);
        if (!cardSnap.exists()) throw new Error('Card not found');

        let bankSnap: any = null;
        if (bankRef) {
          bankSnap = await transaction.get(bankRef);
        }

        // Apply writes
        transaction.update(cardRef, {
          lastPaidDate: Timestamp.fromDate(cp.paymentDate),
          lastPaidAppliedToBank: appliedToBank
        });

        if (bankRef && bankSnap && bankSnap.exists() && appliedToBank) {
          const currentBalance = bankSnap.data().balance || 0;
          transaction.update(bankRef, {
            balance: currentBalance - cp.amount
          });
        }

        // Create persistent action record so it can be undone later
        const actionsCol = collection(db, 'users', user.uid, 'paymentActions');
        const actionRef = doc(actionsCol);
        transaction.set(actionRef, {
          type: 'card_payment',
          cardId: cp.cardId,
          amount: cp.amount,
          paymentDate: Timestamp.fromDate(cp.paymentDate),
          linkedBankAccountId: cp.linkedBankAccountId ?? null,
          prevLastPaidDate: prevLastPaidDate ?? null,
          prevLastPaidApplied: prevLastPaidApplied ?? null,
          prevBankBalance: prevBankBalance ?? null,
          appliedToBank: appliedToBank,
          createdAt: serverTimestamp(),
          undone: false,
        });

        return actionRef.id;
      });

      // After success, reconcile with server value to ensure UI accuracy
      if (cp.linkedBankAccountId) {
        try {
          const bankDoc = await getDoc(doc(db, 'users', user.uid, 'accounts', cp.linkedBankAccountId));
          if (bankDoc.exists()) {
            const bankData = { id: bankDoc.id, ...(bankDoc.data() as Account) };
            setBankAccounts(prev => {
              const newMap = new Map(prev);
              newMap.set(cp.linkedBankAccountId!, bankData);
              return newMap;
            });
          }
        } catch (err) {
          console.error('Failed to refresh bank after markPaid', err);
        }
      }

      // Add persistent undo entry to UI
      setUndoEntries(prev => [{
        id: actionId,
        cardId: cp.cardId,
        prevLastPaidDate,
        prevLastPaidApplied,
        bankId: cp.linkedBankAccountId ?? null,
        prevBankBalance,
        amount: cp.amount,
        paymentDate: cp.paymentDate.getTime(),
        appliedToBank: appliedToBank,
        createdAt: Date.now()
      }, ...prev]);

      // Refresh persisted undo entries from server to include any existing ones
      await fetchUndoEntries();
    } catch (err: any) {
      console.error('Failed to mark as paid', err);
      // Rollback optimistic UI
      setCreditCards(prevCreditCards);
      setBankAccounts(prevBankAccounts);
      alert(`引き落としの記録に失敗しました: ${err?.message || err}. もう一度お試しください。`);
    }
  };

  // Undo handler
  const handleUndo = async (undoId: string, revertBank?: boolean) => {
    const entry = undoEntries.find(e => e.id === undoId);
    if (!entry) return;
    const doRevertBank = typeof revertBank === 'boolean' ? revertBank : (entry.appliedToBank ?? false);

    // Optimistic UI: restore previous values
    const prevCreditCards = creditCards.map(c => ({ ...c }));
    const prevBankAccounts = new Map(bankAccounts);

    setCreditCards(prev => prev.map(c => c.id === entry.cardId ? { ...c, lastPaidDate: (entry.prevLastPaidDate ?? undefined), lastPaidAppliedToBank: (entry.prevLastPaidApplied ?? undefined) } : c));

    if (entry.bankId && doRevertBank) {
      setBankAccounts(prev => {
        const newMap = new Map(prev);
        const bank = newMap.get(entry.bankId!);
        if (bank) newMap.set(entry.bankId!, { ...bank, balance: (entry.prevBankBalance ?? ((bank.balance || 0) + entry.amount)) });
        return newMap;
      });
    }

    try {
      await runTransaction(db, async (transaction) => {
        const cardRef = doc(db, 'users', user.uid, 'accounts', entry.cardId);
        const bankRef = entry.bankId ? doc(db, 'users', user.uid, 'accounts', entry.bankId) : null;
        const actionRef = doc(db, 'users', user.uid, 'paymentActions', entry.id);

        // Read first
        const cardSnap = await transaction.get(cardRef);
        let bankSnap = null;
        if (bankRef) bankSnap = await transaction.get(bankRef);
        const actionSnap = await transaction.get(actionRef);

        // Revert card lastPaidDate and applied flag
        if (cardSnap.exists()) {
          const cardUpdate: any = {};
          if (entry.prevLastPaidDate) {
            cardUpdate.lastPaidDate = entry.prevLastPaidDate;
          } else {
            cardUpdate.lastPaidDate = deleteField();
          }
          if (typeof entry.prevLastPaidApplied !== 'undefined' && entry.prevLastPaidApplied !== null) {
            cardUpdate.lastPaidAppliedToBank = entry.prevLastPaidApplied;
          } else {
            cardUpdate.lastPaidAppliedToBank = deleteField();
          }
          transaction.update(cardRef, cardUpdate);
        }

        // Revert bank balance only if user requested to revert bank
        if (doRevertBank && bankRef && bankSnap && bankSnap.exists()) {
          if (typeof entry.prevBankBalance === 'number') {
            transaction.update(bankRef, { balance: entry.prevBankBalance });
          } else {
            const current = bankSnap.data().balance || 0;
            transaction.update(bankRef, { balance: current + entry.amount });
          }
        }

        // Mark action as undone
        if (actionSnap.exists()) {
          transaction.update(actionRef, { undone: true, undoneAt: serverTimestamp() });
        }
      });

      // Remove undo entry after success
      setUndoEntries(prev => prev.filter(e => e.id !== undoId));
    } catch (err) {
      console.error('Undo failed', err);
      // Rollback optimistic local restoration
      setCreditCards(prevCreditCards);
      setBankAccounts(prevBankAccounts);
      alert('取り消しに失敗しました。');
    }
  };

  // Helper: find or fetch action entry for a given card payment
  const findPaymentActionEntry = async (cp: CardPaymentInfo) => {
    const local = undoEntries.find(e => e.cardId === cp.cardId && e.paymentDate === cp.paymentDate.getTime());
    if (local) return local;
    if (!user) return null;
    try {
      const q = query(
        collection(db, 'users', user.uid, 'paymentActions'),
        where('cardId', '==', cp.cardId),
        where('paymentDate', '==', Timestamp.fromDate(cp.paymentDate)),
        where('undone', '==', false),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      if (snap.docs.length === 0) return null;
      const d = snap.docs[0];
      const data = d.data() as any;
      const entry = {
        id: d.id,
        cardId: data.cardId,
        prevLastPaidDate: data.prevLastPaidDate ?? null,
        bankId: data.linkedBankAccountId ?? null,
        prevBankBalance: data.prevBankBalance ?? null,
        amount: data.amount,
        paymentDate: data.paymentDate && typeof data.paymentDate.toMillis === 'function' ? data.paymentDate.toMillis() : null,
        appliedToBank: data.appliedToBank ?? (data.prevBankBalance != null),
        createdAt: data.createdAt && typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : Date.now()
      };
      setUndoEntries(prev => [entry, ...prev.filter(p => p.id !== entry.id)]);
      return entry;
    } catch (err) {
      console.error('Failed finding action entry', err);
      return null;
    }
  };

  // Toggle handler: mark paid or unmark (restore)
  const togglePaymentPaid = async (cp: CardPaymentInfo) => {
    if (!user) return;
    const card = creditCards.find(c => c.id === cp.cardId);
    const isPaid = card && card.lastPaidDate ? startOfDay(card.lastPaidDate.toDate()).getTime() >= cp.paymentDate.getTime() : false;
    if (isPaid) {
      const entry = await findPaymentActionEntry(cp);
      if (entry) {
        const revert = confirm('口座残高も戻しますか？\nOK: はい（残高を戻す） / キャンセル: いいえ（残高は変更しない）');
        await handleUndo(entry.id, revert);
      } else {
        if (!confirm('元の記録が見つかりませんでした。引き落としを取り消しますか？')) return;
        const revertBank = confirm('口座残高も戻しますか？\nOK: はい（残高を戻す） / キャンセル: いいえ（残高は変更しない）');
        const prevCreditCards = creditCards.map(c => ({ ...c }));
        const prevBankAccounts = new Map(bankAccounts);

        // Optimistic UI
        setCreditCards(prev => prev.map(c => c.id === cp.cardId ? { ...c, lastPaidDate: undefined } : c));
        if (cp.linkedBankAccountId && revertBank) {
          setBankAccounts(prev => {
            const newMap = new Map(prev);
            const bank = newMap.get(cp.linkedBankAccountId!);
            if (bank) newMap.set(cp.linkedBankAccountId!, { ...bank, balance: (bank.balance || 0) + cp.amount });
            return newMap;
          });
        }

        try {
          await runTransaction(db, async (transaction) => {
            const cardRef = doc(db, 'users', user.uid, 'accounts', cp.cardId);
            const bankRef = cp.linkedBankAccountId ? doc(db, 'users', user.uid, 'accounts', cp.linkedBankAccountId) : null;
            const cardSnap = await transaction.get(cardRef);
            let bankSnap = null;
            if (bankRef) bankSnap = await transaction.get(bankRef);

            if (cardSnap.exists()) {
              transaction.update(cardRef, { lastPaidDate: deleteField(), lastPaidAppliedToBank: deleteField() });
            }

            if (revertBank && bankRef && bankSnap && bankSnap.exists()) {
              const current = bankSnap.data().balance || 0;
              transaction.update(bankRef, { balance: current + cp.amount });
            }

            // Create a record to indicate manual undo (for audit)
            const actionsCol = collection(db, 'users', user.uid, 'paymentActions');
            const actionRef = doc(actionsCol);
            transaction.set(actionRef, {
              type: 'card_payment_undo_manual',
              cardId: cp.cardId,
              amount: cp.amount,
              paymentDate: Timestamp.fromDate(cp.paymentDate),
              linkedBankAccountId: cp.linkedBankAccountId ?? null,
              prevLastPaidApplied: null,
              appliedToBank: revertBank,
              createdAt: serverTimestamp(),
              undone: true,
            });
          });

          // Remove any local undo entries for this payment if present
          setUndoEntries(prev => prev.filter(e => !(e.cardId === cp.cardId && e.paymentDate === cp.paymentDate.getTime())));
        } catch (err) {
          console.error('Fallback undo failed', err);
          setCreditCards(prevCreditCards);
          setBankAccounts(prevBankAccounts);
          alert('取り消しに失敗しました。');
        }
      }
    } else {
      await handleMarkPaid(cp);
    }
  };

  // Transfer handler
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!transferFrom || !transferTo) return alert('送金元と送金先を選択してください');
    if (transferFrom === transferTo) return alert('送金元と送金先は同じにできません');
    const amt = Number(transferAmount);
    if (!amt || amt <= 0) return alert('金額を正しく入力してください');

    try {
      await runTransaction(db, async (transaction) => {
        const fromRef = doc(db, 'users', user.uid, 'accounts', transferFrom);
        const toRef = doc(db, 'users', user.uid, 'accounts', transferTo);
        const fromSnap = await transaction.get(fromRef);
        const toSnap = await transaction.get(toRef);
        if (!fromSnap.exists() || !toSnap.exists()) throw new Error('指定した口座が見つかりません');
        const fromBal = fromSnap.data().balance || 0;
        const toBal = toSnap.data().balance || 0;
        transaction.update(fromRef, { balance: fromBal - amt });
        transaction.update(toRef, { balance: toBal + amt });
      });

      // Optimistic UI update
      setBankAccounts(prev => {
        const newMap = new Map(prev);
        const fromAcc = newMap.get(transferFrom);
        const toAcc = newMap.get(transferTo);
        if (fromAcc) newMap.set(transferFrom, { ...fromAcc, balance: (fromAcc.balance || 0) - amt });
        if (toAcc) newMap.set(transferTo, { ...toAcc, balance: (toAcc.balance || 0) + amt });
        return newMap;
      });

      setTransferAmount('');
      setTransferFrom('');
      setTransferTo('');
      setShowTransferForm(false);
      alert('振込が完了しました');
    } catch (err) {
      console.error('Transfer failed', err);
      alert('振込に失敗しました。もう一度お試しください');
    }
  };

  const cardPayments = useMemo(() => {
    const targetMonth = new Date(month.getFullYear(), month.getMonth(), 1);

    return creditCards.map(card => {
      const closingDay = card.closingDay || 99;
      const paymentDay = card.paymentDay || 27;
      const offset = card.paymentMonthOffset ?? 1;

      const linkedMethodIds = paymentMethods
        .filter(pm => pm.linkedAccountId === card.id)
        .map(pm => pm.id);

      if (linkedMethodIds.length === 0 && !(card.type === 'auto_debit' && card.fixedAmount)) return null;

      // Frequency / anchor check (skip if card does not bill this month)
      const frequency = card.paymentFrequency || 1;
      const anchor = card.updatedAt ? card.updatedAt.toDate().getMonth() % frequency : 0;
      if (targetMonth.getMonth() % frequency !== anchor) return null;

      // Compute payment date for the selected month
      let payDate;
      if (paymentDay === 99) {
        payDate = endOfMonth(targetMonth);
      } else {
        const lastDay = endOfMonth(targetMonth).getDate();
        const dayToSet = Math.min(paymentDay, lastDay);
        payDate = setDate(targetMonth, dayToSet);
      }
      payDate = startOfDay(payDate);
      payDate = getNextBusinessDay(payDate);

      // Calculate Billing Cycle (based on that payment date)
      const billingEndMonthDate = subMonths(payDate, offset);
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
        if (!linkedMethodIds.includes(exp.paymentMethodId)) return false;
        const d = startOfDay(exp.date.toDate());
        const irregular = exp.irregularDate ? startOfDay(exp.irregularDate.toDate()) : null;
        const inByIrregular = irregular && irregular >= billingStartDate && irregular <= billingEndDate;
        const inByDate = d >= billingStartDate && d <= billingEndDate && !exp.irregularDate;
        return !!(inByIrregular || inByDate);
      });

      const totalAmount = (card.type === 'auto_debit' && card.fixedAmount) 
        ? card.fixedAmount 
        : cycleExpenses.reduce((sum, e) => sum + e.amount, 0);

      return {
        cardId: card.id,
        cardName: card.name,
        paymentDate: payDate,
        amount: totalAmount,
        linkedBankAccountId: card.linkedBankAccountId || null,
        billingStartDate,
        billingEndDate,
        isFixed: card.type === 'auto_debit' && !!card.fixedAmount,
      } as CardPaymentInfo;
    }).filter((item): item is CardPaymentInfo => item !== null);

  }, [creditCards, paymentMethods, expenses, month]);

  // Group by Bank Account to calculate Total Due per Bank
  // NOTE: Exclude payments that are already marked as paid so totals reflect remaining due
  const bankStatusMap = useMemo(() => {
    const map = new Map<string, { totalDue: number; balance: number; name: string }>();

    // Initialize map with bank accounts
    bankAccounts.forEach(acc => {
      map.set(acc.id, { totalDue: 0, balance: acc.balance, name: acc.name });
    });

    // Sum up dues, excluding already-paid items (based on creditCards.lastPaidDate)
    cardPayments.forEach(cp => {
      if (cp.linkedBankAccountId && map.has(cp.linkedBankAccountId)) {
        const current = map.get(cp.linkedBankAccountId)!;
        const card = creditCards.find(c => c.id === cp.cardId);
        const isPaid = card && card.lastPaidDate ? startOfDay(card.lastPaidDate.toDate()).getTime() >= cp.paymentDate.getTime() : false;
        if (!isPaid) {
          current.totalDue += cp.amount;
        }
        map.set(cp.linkedBankAccountId, current);
      }
    });

    return map;
  }, [bankAccounts, cardPayments, creditCards]);


  if (loading) return <div className="p-4 bg-white dark:bg-black rounded-lg shadow animate-pulse h-40"></div>;
  if (cardPayments.length === 0) return null;

  return (
    <div className="bg-white dark:bg-black p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        カード・自動引き落とし予定 (次回)
      </h2>

      <div className="mb-4">
        {undoEntries.length > 0 && (
          <div className="mb-3 space-y-2">
            {undoEntries.map(u => (
              <div key={u.id} className="p-2 bg-yellow-50 border rounded flex justify-between items-center">
                <div className="text-sm text-gray-700">引き落としを記録しました: ¥{u.amount.toLocaleString()}</div>
                <div className="flex gap-2">
                  <button onClick={() => { const revert = confirm('口座残高も戻しますか？\nOK: はい（残高を戻す） / キャンセル: いいえ（残高は変更しない）'); handleUndo(u.id, revert); }} className="px-2 py-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded text-sm text-gray-800 dark:text-gray-100">取り消す</button>
                  <button onClick={() => setUndoEntries(prev => prev.filter(e => e.id !== u.id))} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm text-gray-800 dark:text-gray-100">閉じる</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setShowTransferForm(s => !s)} className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">振込</button>
        {showTransferForm && (
          <form onSubmit={handleTransfer} className="mt-3 p-3 border rounded bg-gray-50 dark:bg-gray-800">
            <div className="flex flex-wrap gap-2 items-center">
              <select value={transferFrom} onChange={e => setTransferFrom(e.target.value)} className="p-2 border rounded bg-white dark:bg-black">
                <option value="">送金元を選択</option>
                {Array.from(bankAccounts.values()).filter(b => b.type === 'bank').map(b => (
                  <option key={b.id} value={b.id}>{b.name} (¥{b.balance?.toLocaleString() || 0})</option>
                ))}
              </select>

              <select value={transferTo} onChange={e => setTransferTo(e.target.value)} className="p-2 border rounded bg-white dark:bg-black">
                <option value="">送金先を選択</option>
                {Array.from(bankAccounts.values()).filter(b => b.type === 'bank').map(b => (
                  <option key={b.id} value={b.id}>{b.name} (¥{b.balance?.toLocaleString() || 0})</option>
                ))}
              </select>

              <input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="金額" className="p-2 border rounded w-40 bg-white dark:bg-black" />

              <button type="submit" className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">送金</button>
              <button type="button" onClick={() => setShowTransferForm(false)} className="px-3 py-1 bg-gray-300 text-black rounded">キャンセル</button>
            </div>
          </form>
        )}
      </div>

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
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <input 
                      type="checkbox" 
                      checked={(() => {
                        const card = creditCards.find(c => c.id === cp.cardId);
                        return !!(card && card.lastPaidDate && startOfDay(card.lastPaidDate.toDate()).getTime() >= cp.paymentDate.getTime());
                      })()}
                      onChange={() => togglePaymentPaid(cp)}
                      className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                      title="引き落とし完了にする／取り消す"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{cp.cardName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      引き落とし日: <span className="font-bold">{cp.paymentDate.toLocaleDateString()}</span>
                    </p>
                    {!cp.isFixed && (
                      <p className="text-xs text-gray-400">
                        ({cp.billingStartDate.toLocaleDateString().slice(5)} ~ {cp.billingEndDate.toLocaleDateString().slice(5)}利用分)
                      </p>
                    )}
                    {cp.isFixed && (
                      <p className="text-xs text-gray-400">
                        (毎月固定額)
                      </p>
                    )}
                  </div>
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
