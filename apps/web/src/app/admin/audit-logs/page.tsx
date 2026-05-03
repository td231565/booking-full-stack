import { EmptyState } from '@/components/ui/status-state';

export const dynamic = 'force-dynamic';

// 顯示後台稽核紀錄骨架，Phase 5 會串接 GET /api/admin/audit-logs。
export default function AdminAuditLogsPage() {
  return (
    <main className="page">
      <h1>稽核紀錄</h1>
      <EmptyState title="尚未載入稽核紀錄" description="Phase 5 會加入 audit log 查詢流程。" />
    </main>
  );
}
