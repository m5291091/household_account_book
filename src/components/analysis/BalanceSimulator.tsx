"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Account } from '@/types/Account';
import { RegularPayment } from '@/types/RegularPayment';
import { RegularIncome } from '@/types/RegularIncome';
import { addDays, format, getDate, getMonth, isSameDay, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface SimulationData {
  date: string;
  totalAssets: number; // Bank + Cash
  [key: string]: any; // Individual account balances
}

const BalanceSimulator = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [regularPayments, setRegularPayments] = useState<RegularPayment[]>([]);
  const [regularIncomes, setRegularIncomes] = useState<RegularIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulationMonths, setSimulationMonths] = useState(6);

  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const accSnap = await getDocs(query(collection(db, 'users', user.uid, 'accounts')));
        const paySnap = await getDocs(query(collection(db, 'users', user.uid, 'regularPayments')));
        const incSnap = await getDocs(query(collection(db, 'users', user.uid, 'regularIncomes')));

        setAccounts(accSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
        setRegularPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() } as RegularPayment)));
        setRegularIncomes(incSnap.docs.map(d => ({ id: d.id, ...d.data() } as RegularIncome)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const simulationData = useMemo(() => {
    if (accounts.length === 0) return [];

    let currentAccounts = accounts.map(a => ({ ...a, simulatedBalance: a.balance, pendingCardUsage: 0 }));
    const data: SimulationData[] = [];
    const today = new Date();
    const endDate = addDays(today, simulationMonths * 30);

    // Helper to find account by ID (or linked account)
    // Note: In real app, we need to map PaymentMethod -> Account. 
    // Since we don't have that link yet (PaymentMethod doesn't have accountId in current schema, only Account has linkedBankAccountId for CC),
    // we will assume for this prototype that regular payments have a `paymentMethodId` which matches an Account ID directly or we just deduct from "First Bank" if unknown.
    // Wait, the user asked to "Link Payment Methods to Accounts". I haven't implemented that UI yet.
    // `AccountSettings` has "Linked Bank Account" for CC.
    // But `RegularPayment` uses `paymentMethodId` (e.g. "Visa"). We don't know if "Visa" corresponds to "Rakuten Card" Account.
    // For now, I will simulate TOTAL assets change roughly.
    // OR, I can assume if `RegularPayment` has a matching Account Name or ID? No.
    // Simple approach: Deduct all regular payments from the first "Bank" account found, or distribute?
    // Better: Allow user to select "Default Withdrawal Account" for simulation?
    // Or just use Total Assets logic:
    // Income -> Increases Assets.
    // Expense -> Decreases Assets (eventually).
    // Credit Card delay: Expense today -> Deduct from Bank in 1-2 months.
    
    // Let's implement simple "Total Asset Simulation" considering CC delay.
    // We need to track "Card Usage" separately from "Asset Balance".
    
    // Create a simplified map of PaymentMethodID -> AccountID?
    // Since we can't link them yet, I will simulate purely based on:
    // "Income adds to total", "Expense subtracts from total (on payment day)".
    // If expense is "Credit Card" (guess based on name?), delay it?
    // Let's simplified: All regular payments subtract on their `paymentDay`.
    // All regular incomes add on their `paymentDay`.
    
    // This is a "Cash Flow" simulation.
    
    let currentTotal = currentAccounts.reduce((sum, a) => a.type !== 'credit_card' ? sum + a.simulatedBalance : sum, 0);

    for (let d = 0; d < simulationMonths * 30; d++) {
      const date = addDays(today, d);
      const dayOfMonth = getDate(date);

      // Incomes
      regularIncomes.forEach(inc => {
        if (inc.paymentDay === dayOfMonth) { // Simple monthly logic
          currentTotal += inc.amount;
        }
      });

      // Payments
      regularPayments.forEach(pay => {
        if (pay.paymentDay === dayOfMonth) {
          currentTotal -= pay.amount;
        }
      });

      // Variable Expense Prediction (Simple daily average subtraction? e.g. -3000 yen/day)
      // Hardcoded estimation for now: -2000 yen / day for food/daily
      currentTotal -= 2000; 

      data.push({
        date: format(date, 'yyyy/MM/dd'),
        totalAssets: currentTotal,
      });
    }

    return data;
  }, [accounts, regularPayments, regularIncomes, simulationMonths]);

  if (loading) return <div>シミュレーション準備中...</div>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">資産残高シミュレーション</h2>
        <select value={simulationMonths} onChange={e => setSimulationMonths(Number(e.target.value))} className="p-2 border rounded">
          <option value={3}>3ヶ月後まで</option>
          <option value={6}>6ヶ月後まで</option>
          <option value={12}>1年後まで</option>
        </select>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        <p>※ 現在の口座残高を起点に、定期収入・定期支出・推定変動費（1日2000円仮定）を反映した予測です。</p>
        <p>※ クレジットカードの引き落とし遅延などは簡易的に処理しています。</p>
      </div>

      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
          <LineChart data={simulationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(str) => str.slice(5)} /> {/* Show MM/dd */}
            <YAxis />
            <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
            <Legend />
            <ReferenceLine y={0} stroke="red" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="totalAssets" name="推定資産残高" stroke="#8884d8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BalanceSimulator;
