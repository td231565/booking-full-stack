import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from './admin-login-form';
import { getCurrentUserFromCookieHeader } from '@/lib/auth/get-current-user';

export const dynamic = 'force-dynamic';

// 顯示後台專用登入頁，已登入 admin 直接導向預約管理。
export default async function AdminLoginPage() {
  const user = await getCurrentUserFromCookieHeader((await cookies()).toString());

  if (user?.role === 'admin') {
    redirect('/admin/bookings');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-elevated p-8 shadow-lg">
        <header className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">後台管理系統</h1>
          <p className="mt-2 text-sm text-ink-muted">請使用管理員帳號登入</p>
        </header>
        <AdminLoginForm />
      </div>
    </div>
  );
}
