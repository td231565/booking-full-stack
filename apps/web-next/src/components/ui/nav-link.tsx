'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';

type NavLinkProps = ComponentProps<typeof Link>;

// 導覽連結，依目前路徑顯示 active 樣式。
export function NavLink({ children, href, className = '', ...props }: NavLinkProps) {
  const pathname = usePathname();
  const hrefString = typeof href === 'string' ? href : (href.pathname ?? '/');
  const isActive = pathname === hrefString || (hrefString !== '/' && pathname.startsWith(hrefString));

  return (
    <Link
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ease-out ${
        isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface hover:text-ink'
      } ${className}`}
      href={href}
      {...props}
    >
      {children}
    </Link>
  );
}
