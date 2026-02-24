import { Timestamp } from 'firebase/firestore';

export interface RegularPayment {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  paymentDay: number;
  // Interval settings
  frequency: 'months' | 'years';
  interval: number; // e.g., 3 for every 3 months/years
  // Tracking
  nextPaymentDate: Timestamp; // The date the next expense should be generated
  isChecked?: boolean;
  groupId?: string; // ID of the RegularPaymentGroup
}

export interface RegularPaymentFormData {
  name: string;
  amount: string;
  categoryId: string;
  paymentMethodId: string;
  paymentDay: string;
  frequency: 'months' | 'years';
  interval: string;
  nextPaymentDate: string; // YYYY-MM-DD
  groupId?: string;
}