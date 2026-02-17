import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { Account } from '@/types/Account';
import { RegularPayment } from '@/types/RegularPayment';
import { RegularIncome } from '@/types/RegularIncome';
import { PaymentMethod } from '@/types/PaymentMethod';
import { addDays, format, getDate, getMonth, isSameDay, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface SimulationData {
  date: string;
  totalBankBalance: number;
}

const BalanceSimulator = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [regularPayments, setRegularPayments] = useState<RegularPayment[]>([]);
  const [regularIncomes, setRegularIncomes] = useState<RegularIncome[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
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
        const pmSnap = await getDocs(query(collection(db, 'users', user.uid, 'paymentMethods')));

        setAccounts(accSnap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
        setRegularPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() } as RegularPayment)));
        setRegularIncomes(incSnap.docs.map(d => ({ id: d.id, ...d.data() } as RegularIncome)));
        setPaymentMethods(pmSnap.docs.map(d => ({ id: d.id, ...d.data() } as PaymentMethod)));
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

    // Initialize accounts state
    let simAccounts = accounts.map(a => ({ 
      ...a, 
      simulatedBalance: a.balance,
      cardUsage: 0 // Current cycle usage
    }));

    const data: SimulationData[] = [];
    const today = new Date();
    
    // Map PaymentMethod ID to Account
    const pmToAccountMap = new Map<string, Account>();
    paymentMethods.forEach(pm => {
      if (pm.linkedAccountId) {
        const acc = accounts.find(a => a.id === pm.linkedAccountId);
        if (acc) pmToAccountMap.set(pm.id, acc);
      }
    });

    for (let d = 0; d < simulationMonths * 30; d++) {
      const date = addDays(today, d);
      const dayOfMonth = getDate(date);

      // 1. Process Regular Incomes
      regularIncomes.forEach(inc => {
        if (inc.paymentDay === dayOfMonth) {
          // Add to first bank account found (default) or handle linked account if Income had one (it doesn't yet)
          // For now, add to first BANK account
          const targetAcc = simAccounts.find(a => a.type === 'bank');
          if (targetAcc) targetAcc.simulatedBalance += inc.amount;
        }
      });

      // 2. Process Regular Payments
      regularPayments.forEach(pay => {
        if (pay.paymentDay === dayOfMonth) {
          const linkedAccount = pmToAccountMap.get(pay.paymentMethodId);
          
          if (linkedAccount) {
            const simAccIndex = simAccounts.findIndex(a => a.id === linkedAccount.id);
            if (simAccIndex !== -1) {
              if (linkedAccount.type === 'credit_card') {
                // Add to card usage, NOT deducted from bank yet
                simAccounts[simAccIndex].cardUsage += pay.amount;
              } else {
                // Direct debit (Bank/Cash)
                simAccounts[simAccIndex].simulatedBalance -= pay.amount;
              }
            }
          } else {
            // No link, deduct from first bank (fallback)
            const targetAcc = simAccounts.find(a => a.type === 'bank');
            if (targetAcc) targetAcc.simulatedBalance -= pay.amount;
          }
        }
      });

      // 3. Process Credit Card Payments (Withdrawal from Bank)
      simAccounts.forEach((acc, idx) => {
        if (acc.type === 'credit_card' && acc.paymentDay === dayOfMonth && acc.linkedBankAccountId) {
          // Simplify: Assume all "cardUsage" is paid off on payment day
          // Realistically, it's usage from previous closing date. 
          // For this simulation, let's assume monthly cycle aligns roughly.
          const amountToPay = acc.cardUsage;
          if (amountToPay > 0) {
            const bankIndex = simAccounts.findIndex(b => b.id === acc.linkedBankAccountId);
            if (bankIndex !== -1) {
              simAccounts[bankIndex].simulatedBalance -= amountToPay;
              simAccounts[idx].cardUsage = 0; // Reset usage after payment
            }
          }
        }
      });

      // 4. Daily Variable Expense Estimation (Deduct from Bank)
      const targetAcc = simAccounts.find(a => a.type === 'bank');
      if (targetAcc) targetAcc.simulatedBalance -= 2000; // Hardcoded estimate

      // Calculate Total Bank Balance (Available Liquidity)
      const totalBankBalance = simAccounts.reduce((sum, a) => (a.type === 'bank' || a.type === 'cash') ? sum + a.simulatedBalance : sum, 0);

      data.push({
        date: format(date, 'yyyy/MM/dd'),
        totalBankBalance,
      });
    }

    return data;
  }, [accounts, regularPayments, regularIncomes, paymentMethods, simulationMonths]);

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
        <p>※ 銀行口座と現金の合計残高の推移予測です。</p>
        <p>※ クレジットカード払いの支出は、設定された引き落とし日に銀行口座から減算されます。</p>
      </div>

      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
          <LineChart data={simulationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(str) => str.slice(5)} />
            <YAxis />
            <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
            <Legend />
            <ReferenceLine y={0} stroke="red" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="totalBankBalance" name="推定資産残高" stroke="#8884d8" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BalanceSimulator;
