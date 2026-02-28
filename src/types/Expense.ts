// /Users/alphabetagamma/work/APP/household_account_book/src/types/Expense.ts
import { Timestamp } from 'firebase/firestore';

export interface CheckStatus {
  id: string;
  color: string;
  label: string;
}

export interface Expense {
  id: string;
  date: Timestamp;
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  store?: string;
  memo?: string;
  isChecked?: boolean;
  checkStatusId?: string; // Newly added to support multiple statuses
  irregularDate?: Timestamp | null; // Null means it's regular. If set, this date determines which month's budget/total it counts towards.
  receiptUrl?: string;
  receiptName?: string;        // カスタム表示名
  receiptFolderId?: string | null; // 所属フォルダID (null = ルート)
  receiptOrder?: number;       // カスタム並び順
  isTransfer?: boolean;        // 振替（チャージなど）。trueの場合は支出集計から除外される
}

// This is for the form state before converting to Firestore types
export interface ExpenseFormData {
  date: string; // YYYY-MM-DD
  amount: string;
  categoryId: string;
  paymentMethodId: string;
  store: string;
  memo: string;
  irregularMonth: string; // YYYY-MM, empty string means not irregular
  receiptFile?: File | null;
  receiptUrl?: string;
}
