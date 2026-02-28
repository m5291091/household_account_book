import { Timestamp } from 'firebase/firestore';

export interface StandaloneReceipt {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  uploadedAt: Timestamp;
  linkedExpenseId: string | null;
  memo?: string;
}
