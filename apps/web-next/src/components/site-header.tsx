'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MemberUserMenu } from '@/components/member/member-user-menu';
import { NavLink } from '@/components/ui/nav-link';
import { useCurrentMemberUser } from '@/lib/auth/use-current-member-user';

// 顯示公開站點導覽列，後台路由使用獨立版面故不顯示此 header。
export function SiteHeader() {
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated } = useCurrentMemberUser();

  if (pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-elevated/95 backdrop-blur-sm">
      <nav aria-label="主要導覽" className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
        <Link className="mr-auto text-base font-bold tracking-tight text-ink" href="/">
          預約排程
        </Link>
        <NavLink href="/services">服務</NavLink>
        <NavLink href="/my/bookings">我的預約</NavLink>
        {!isLoading && isAuthenticated && user ? <MemberUserMenu user={user} /> : null}
        {!isLoading && !isAuthenticated ? <NavLink href="/login">登入</NavLink> : null}
      </nav>
    </header>
  );
}
