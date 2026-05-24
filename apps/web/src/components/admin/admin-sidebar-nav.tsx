'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminNavItems } from '@/components/admin/admin-nav-config';

// 顯示後台左側 sidebar 路由選單，依目前路徑高亮 active 項目。
export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="後台導覽" className="flex flex-1 flex-col gap-1 px-3 py-4">
      {adminNavItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-200 ease-out ${
              isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            href={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
