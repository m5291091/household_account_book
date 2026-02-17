import { Timestamp } from 'firebase/firestore';

export type AccountType = 'bank' | 'credit_card' | 'cash' | 'electronic_money';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number; // Current balance (for banks/cash) or Current Usage (for credit cards, usually 0 if tracking debt, or negative?) 
                   // Actually for Credit Card, 'balance' usually means 'Amount Used / Debt'. 
                   // But for simplicity, let's track 'Asset Value'. 
                   // Bank: +1000. Credit Card: -500 (Debt).
                   // User asked to input "Bank Balance".
  
  // Credit Card specific
  closingDay?: number; // 締め日 (1-31, 99 for end of month)
  paymentDay?: number; // 引き落とし日
  linkedBankAccountId?: string; // 引き落とし口座

  updatedAt: Timestamp;
}

export interface AccountFormData {
  name: string;
  type: AccountType;
  balance: string;
  closingDay: string;
  paymentDay: string;
  linkedBankAccountId: string;
}
