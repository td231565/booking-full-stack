import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site-header';

type SiteLayoutProps = {
  children: ReactNode;
};

// 前台專用 Layout，包裹公開站與會員頁面，包含全站 SiteHeader。
export default function SiteLayout({ children }: SiteLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
    </div>
  );
}
