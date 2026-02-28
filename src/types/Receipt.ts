import { Timestamp } from 'firebase/firestore';

export interface StandaloneReceipt {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  uploadedAt: Timestamp;
  displayDate?: Timestamp;        // Set when linked; reflects the linked expense's date
  receiptFolderId?: string | null; // Folder organisation (same tree as expenses)
  linkedExpenseIds: string[];  // Array of linked expense IDs (supports multiple links)
  memo?: string;
}
