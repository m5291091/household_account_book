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
  [key: string]: any; // To hold dynamic account balances
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
    // We create a deep copy for simulation to avoid mutating state
    let simAccounts = accounts.map(a => ({ 
      ...a, 
      simulatedBalance: Number(a.balance), // Ensure number
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
      // This is a rough estimate. Deduct from first bank account.
      const targetAcc = simAccounts.find(a => a.type === 'bank');
      if (targetAcc) targetAcc.simulatedBalance -= 2000; // Hardcoded estimate

      // Calculate Total Bank Balance (Available Liquidity)
      const totalBankBalance = simAccounts.reduce((sum, a) => (a.type === 'bank' || a.type === 'cash') ? sum + a.simulatedBalance : sum, 0);

      const dataPoint: SimulationData = {
        date: format(date, 'yyyy/MM/dd'),
        totalBankBalance,
      };
      
      // Store individual account balances
      simAccounts.forEach(acc => {
        if (acc.type === 'bank' || acc.type === 'cash') {
            dataPoint[acc.id] = acc.simulatedBalance;
        }
      });

      data.push(dataPoint);
    }

    return data;
  }, [accounts, regularPayments, regularIncomes, paymentMethods, simulationMonths]);

  // Extract monthly data points for the table (e.g., end of each month)
  const monthlyData = useMemo(() => {
    if (simulationData.length === 0) return [];
    
    // Group by month and take the last entry of each month
    const lastDayMap = new Map<string, SimulationData>();
    simulationData.forEach(d => {
        const monthKey = d.date.substring(0, 7); // yyyy/MM
        lastDayMap.set(monthKey, d);
    });
    
    return Array.from(lastDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [simulationData]);

  if (loading) return <div className="p-8 text-center text-gray-500">シミュレーションデータを読み込み中...</div>;

  const bankAccounts = accounts.filter(a => a.type === 'bank');

  return (
    <div className="space-y-8">
      {/* Current Balances Section */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold text-gray-800 mb-4">現在の口座残高</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bankAccounts.length === 0 ? (
            <p className="text-gray-500">銀行口座が登録されていません。</p>
          ) : (
            bankAccounts.map(account => (
              <div key={account.id} className="border rounded-lg p-4 bg-gray-50 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-700">{account.name}</p>
                  <p className="text-xs text-gray-500">銀行口座</p>
                </div>
                <p className="text-xl font-bold text-indigo-600">
                  ¥{Number(account.balance).toLocaleString()}
                </p>
              </div>
            ))
          )}
          {/* Total */}
          <div className="border rounded-lg p-4 bg-indigo-50 flex justify-between items-center border-indigo-100">
            <div>
              <p className="font-semibold text-indigo-900">合計資産残高</p>
              <p className="text-xs text-indigo-400">全口座合計</p>
            </div>
            <p className="text-2xl font-bold text-indigo-700">
              ¥{bankAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Simulation Chart Section */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">資産残高シミュレーション</h2>
          <select value={simulationMonths} onChange={e => setSimulationMonths(Number(e.target.value))} className="p-2 border rounded bg-white">
            <option value={3}>3ヶ月後まで</option>
            <option value={6}>6ヶ月後まで</option>
            <option value={12}>1年後まで</option>
          </select>
        </div>

        <div className="mb-4 text-sm text-gray-600 bg-blue-50 p-3 rounded border border-blue-100">
          <ul className="list-disc list-inside space-y-1">
            <li>銀行口座と現金の合計残高の推移予測です。</li>
            <li>クレジットカード払いの支出は、設定された引き落とし日に銀行口座から減算されます。</li>
            <li>毎日の変動費として仮の金額（¥2,000/日）を減算しています。</li>
          </ul>
        </div>

        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <LineChart data={simulationData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(str) => str.slice(5)} 
                minTickGap={30}
                stroke="#9ca3af"
              />
              <YAxis 
                stroke="#9ca3af"
                tickFormatter={(val) => `¥${(val / 10000).toFixed(0)}万`}
              />
              <Tooltip 
                formatter={(value: number) => `¥${value.toLocaleString()}`}
                labelFormatter={(label) => label}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
              <Line 
                type="monotone" 
                dataKey="totalBankBalance" 
                name="合計資産残高" 
                stroke="#4f46e5" 
                strokeWidth={3} 
                dot={false}
                activeDot={{ r: 6 }} 
              />
              {/* Optional: Add lines for individual accounts if needed, but might be too cluttered. Focus on Total for Chart. */}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Projection Table */}
        <div className="mt-8 overflow-x-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-4">月次推移予測 (月末時点)</h3>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">年月</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-bold">合計資産</th>
                        {bankAccounts.map(acc => (
                            <th key={acc.id} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{acc.name}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {monthlyData.map((data, idx) => (
                        <tr key={data.date} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                {data.date.substring(0, 7)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-indigo-600">
                                ¥{data.totalBankBalance.toLocaleString()}
                            </td>
                            {bankAccounts.map(acc => (
                                <td key={acc.id} className="px-6 py-4 whitespace-nowrap text-right text-gray-700">
                                    ¥{data[acc.id]?.toLocaleString() || '-'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default BalanceSimulator;
