import { Timestamp } from 'firebase/firestore';

export interface RegularIncome {
  id: string;
  name: string; // e.g. Salary, Bonus
  amount: number;
  totalTaxableAmount?: number;
  category: string; // Store category name directly for now as Income uses strings
  frequency: 'months' | 'years';
  interval: number;
  paymentDay: number; // Day of the month
  nextPaymentDate: Timestamp;
  linkedBankAccountId?: string | null; // 入金先口座
}

export interface RegularIncomeFormData {
  name: string;
  amount: string;
  totalTaxableAmount: string;
  category: string;
  frequency: string;
  interval: string;
  nextPaymentDate: string;
  linkedBankAccountId: string;
}
