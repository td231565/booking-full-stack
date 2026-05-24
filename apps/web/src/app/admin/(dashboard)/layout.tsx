import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminLogoutButton } from '@/components/admin/admin-logout-button';
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav';
import { AdminStatusBar } from '@/components/admin/admin-status-bar';
import { CurrentUser, getCurrentUserFromCookieHeader } from '@/lib/auth/get-current-user';

export const dynamic = 'force-dynamic';

type AdminDashboardLayoutProps = {
  children: ReactNode;
};

// 建立後台 dashboard 版面，含 sidebar、status bar 與 admin 權限檢查。
export default async function AdminDashboardLayout({ children }: AdminDashboardLayoutProps) {
  const user = await getCurrentUserFromCookieHeader((await cookies()).toString());

  if (!user || user.role !== 'admin') {
    redirect('/admin/login');
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}

// 組合 sidebar 與主內容區，固定全螢幕高度作為獨立後台版面。
function AdminShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="flex h-screen bg-surface">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-ink">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-white/50">Admin</p>
          <p className="mt-1 text-base font-semibold text-white">預約排程後台</p>
        </div>
        <AdminSidebarNav />
        <AdminLogoutFooter />
      </aside>
      <AdminMain user={user}>{children}</AdminMain>
    </div>
  );
}

// 顯示 status bar 與可捲動的主內容區。
function AdminMain({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <AdminStatusBar user={user} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

// 將登出按鈕固定在 sidebar 底部，方便管理員離開後台。
function AdminLogoutFooter() {
  return (
    <div className="border-t border-white/10 px-3 py-4">
      <AdminLogoutButton />
    </div>
  );
}
