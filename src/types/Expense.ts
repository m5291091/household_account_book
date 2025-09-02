// /Users/alphabetagamma/work/APP/household_account_book/src/types/Expense.ts
import { Timestamp } from 'firebase/firestore';

export const CHECK_COLORS = ['yellow', 'green', 'blue', 'red', 'orange', 'purple'] as const;
export type CheckColor = typeof CHECK_COLORS[number];

export interface Expense {
  id: string;
  date: Timestamp;
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  store?: string;
  memo?: string;
  isIrregular: boolean;
  checkColor?: CheckColor | null;
  isChecked?: boolean;
}

// This is for the form state before converting to Firestore types
export interface ExpenseFormData {
  date: string; // YYYY-MM-DD
  amount: string;
  categoryId: string;
  paymentMethodId: string;
  store: string;
  memo: string;
  isIrregular: boolean;
  checkColor?: CheckColor | null;
}
