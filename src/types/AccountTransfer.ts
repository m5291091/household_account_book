import { Timestamp } from 'firebase/firestore';

/**
 * 電子マネーへのチャージ（口座間振替）を記録するドキュメント。
 * チャージは支出ではないため expenses コレクションには含まれない。
 * コレクション: users/{uid}/accountTransfers
 */
export interface AccountTransfer {
  id: string;
  date: Timestamp;
  amount: number;
  toAccountId: string;           // チャージ先の電子マネー口座ID
  fromAccountId?: string | null; // 引き落とし元口座ID (null = 記録しない)
  memo?: string;
}
