// /Users/alphabetagamma/work/APP/household_account_book/src/types/Expense.ts
import { Timestamp } from 'firebase/firestore';

export interface Expense {
  id: string;
  date: Timestamp;
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  store?: string;
  memo?: string;
  isChecked?: boolean;
  isIrregular?: boolean;
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
}
