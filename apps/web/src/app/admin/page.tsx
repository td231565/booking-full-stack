import Link from 'next/link';
import { Page, PageHeader, Panel } from '@/components/ui/page';

export const dynamic = 'force-dynamic';

const adminLinks = [
  { href: '/admin/services', title: '服務管理', description: '管理公開、停用與隱藏服務' },
  { href: '/admin/availability', title: '時段管理', description: '建立與批次產生可預約時段' },
  { href: '/admin/bookings', title: '預約管理', description: '查看與管理所有會員預約' },
  { href: '/admin/audit-logs', title: '稽核紀錄', description: '檢視後台重要異動紀錄' },
];

// 顯示後台首頁，後台頁固定為 dynamic 避免共享快取。
export default function AdminHomePage() {
  return (
    <Page>
      <PageHeader description="後台 API 會在後端檢查 admin 權限，非管理員無法取得資料。" title="後台管理" />
      <ul className="flex flex-col gap-3">
        {adminLinks.map((item) => (
          <li key={item.href}>
            <Link
              className="block rounded-lg border border-border bg-elevated p-5 transition-colors duration-200 ease-out hover:border-accent/40 hover:bg-accent-soft/30"
              href={item.href}
            >
              <span className="text-base font-semibold text-ink">{item.title}</span>
              <span className="mt-1 block text-sm text-ink-muted">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Panel className="mt-8 max-w-prose">
        <p className="text-sm text-ink-muted">此區為管理工具介面，視覺與公開頁一致，但資訊密度較高。</p>
      </Panel>
    </Page>
  );
}
