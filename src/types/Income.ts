import { Timestamp } from 'firebase/firestore';

export interface Income {
  id: string;
  source: string;
  amount: number;
  date: Timestamp;
  category: string;
  memo?: string;
}

export interface IncomeFormData {
  source: string;
  amount: string;
  date: string;
  category: string;
  memo?: string;
}
