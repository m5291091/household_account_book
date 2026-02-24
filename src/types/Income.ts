import { Timestamp } from 'firebase/firestore';

export interface Income {
  id: string;
  source: string;
  amount: number; // This will represent Net Income (差引支給額)
  totalTaxableAmount?: number; // 課税合計
  date: Timestamp;
  category: string;
  memo?: string;
}

export interface IncomeFormData {
  source: string;
  amount: string; // Net Income
  totalTaxableAmount?: string; // 課税合計
  date: string;
  category: string;
  memo?: string;
}
