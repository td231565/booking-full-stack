import { EmptyState } from '@/components/ui/status-state';

export const dynamic = 'force-dynamic';

// 顯示後台時段管理骨架，Phase 5 會串接單筆與批次產生時段 API。
export default function AdminAvailabilityPage() {
  return (
    <main className="page">
      <h1>時段管理</h1>
      <EmptyState title="尚未載入時段資料" description="Phase 5 會加入 availability-slots 管理流程。" />
    </main>
  );
}
