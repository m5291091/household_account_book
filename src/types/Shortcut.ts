export type ShortcutAction = 
  | 'NAV_DASHBOARD'
  | 'NAV_EXPENSE_RECORD'
  | 'NAV_INCOME_RECORD'
  | 'NAV_CALENDAR'
  | 'NAV_ANALYSIS'
  | 'NAV_SETTINGS'
  | 'NAV_YEARLY_REPORT';

export interface ShortcutConfig {
  action: ShortcutAction;
  label: string;
  defaultKey: string; // e.g. 'd', 'e', 'i' (combined with modifier)
  description: string;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { action: 'NAV_DASHBOARD', label: 'ダッシュボードへ移動', defaultKey: 'd', description: 'ダッシュボード画面を開きます' },
  { action: 'NAV_EXPENSE_RECORD', label: '支出記録へ移動', defaultKey: 'e', description: '支出記録画面を開きます' },
  { action: 'NAV_INCOME_RECORD', label: '収入管理へ移動', defaultKey: 'i', description: '収入管理画面を開きます' },
  { action: 'NAV_CALENDAR', label: 'カレンダーへ移動', defaultKey: 'c', description: 'カレンダー画面を開きます' },
  { action: 'NAV_ANALYSIS', label: '分析へ移動', defaultKey: 'a', description: '支出分析画面を開きます' },
  { action: 'NAV_YEARLY_REPORT', label: '年間レポートへ移動', defaultKey: 'y', description: '年間レポート画面を開きます' },
  { action: 'NAV_SETTINGS', label: '設定へ移動', defaultKey: 's', description: '設定画面を開きます' },
];

export interface UserShortcutSettings {
  platform: 'mac' | 'other';
  customKeys: { [key in ShortcutAction]?: string }; // Stores customized keys (single char)
}
