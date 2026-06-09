'use client';

import { usePathname } from 'next/navigation';
import { getAdminPageTitle } from '@/components/admin/admin-nav-config';
import type { CurrentUser } from '@/lib/auth/get-current-user';

type AdminStatusBarProps = {
  user: CurrentUser;
};

// 顯示後台頂部 status bar，包含目前頁面標題與登入人員資訊。
export function AdminStatusBar({ user }: AdminStatusBarProps) {
  const pathname = usePathname();
  const pageTitle = getAdminPageTitle(pathname);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
      <h1 className="text-lg font-semibold text-ink">{pageTitle}</h1>
      <UserInfo displayName={user.displayName} role={user.role} />
    </header>
  );
}

// 顯示登入人員名稱與角色標籤。
function UserInfo({ displayName, role }: { displayName: string; role: CurrentUser['role'] }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-ink-muted">{displayName}</span>
      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
        {role === 'admin' ? '管理員' : '會員'}
      </span>
    </div>
  );
}
