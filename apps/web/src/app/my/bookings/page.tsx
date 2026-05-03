import { EmptyState } from '@/components/ui/status-state';

export const dynamic = 'force-dynamic';

// 顯示我的預約列表骨架，私人資料頁先固定為 dynamic 避免共享快取。
export default function MyBookingsPage() {
  return (
    <main className="page">
      <h1>我的預約</h1>
      <EmptyState title="尚未載入預約資料" description="Phase 4 會串接 GET /api/me/bookings。" />
    </main>
  );
}
