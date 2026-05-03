import { EmptyState } from '@/components/ui/status-state';

export const dynamic = 'force-dynamic';

// 顯示後台預約管理骨架，Phase 5 會串接 admin bookings API。
export default function AdminBookingsPage() {
  return (
    <main className="page">
      <h1>預約管理</h1>
      <EmptyState title="尚未載入後台預約資料" description="Phase 5 會加入預約篩選、建立與取消流程。" />
    </main>
  );
}
