export type AdminNavItem = {
  href: string;
  label: string;
};

// 定義後台 sidebar 選單項目，供導覽與 status bar 標題對照共用。
export const adminNavItems: AdminNavItem[] = [
  { href: '/admin/bookings', label: '預約管理' },
  { href: '/admin/services', label: '服務管理' },
  { href: '/admin/availability', label: '時段管理' },
  { href: '/admin/audit-logs', label: '稽核紀錄' },
];

// 依 pathname 取得目前頁面標題，供 status bar 顯示。
export function getAdminPageTitle(pathname: string): string {
  const matchedItem = adminNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return matchedItem?.label ?? '後台管理';
}
