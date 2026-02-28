import { Timestamp } from 'firebase/firestore';

export type SavingsGoalType = 'fixed' | 'percentage';

export interface SavingsGoal {
  id: string;
  name: string;
  type: SavingsGoalType;
  amount: number;       // 固定額 (type='fixed' の場合に使用)
  percentage: number;   // 収入に対する割合 0-100 (type='percentage' の場合に使用)
  linkedAccountId: string; // 貯金先口座ID
  updatedAt: Timestamp;
}

export interface SavingsGoalFormData {
  name: string;
  type: SavingsGoalType;
  amount: string;
  percentage: string;
  linkedAccountId: string;
}
