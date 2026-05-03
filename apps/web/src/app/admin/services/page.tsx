import { EmptyState } from '@/components/ui/status-state';

export const dynamic = 'force-dynamic';

// 顯示後台服務管理骨架，Phase 5 會串接 admin services API。
export default function AdminServicesPage() {
  return (
    <main className="page">
      <h1>服務管理</h1>
      <EmptyState title="尚未載入服務管理資料" description="Phase 5 會加入建立與更新服務流程。" />
    </main>
  );
}
