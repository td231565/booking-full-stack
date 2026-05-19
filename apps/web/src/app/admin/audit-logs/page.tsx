import { cookies } from 'next/headers';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { AdminAuditLog, getAdminAuditLogs } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';

export const dynamic = 'force-dynamic';

// 顯示後台稽核紀錄列表，查詢類 Admin API 不會額外寫入 audit log。
export default async function AdminAuditLogsPage() {
  try {
    const response = await getAdminAuditLogs({ cookieHeader: (await cookies()).toString() });

    return (
      <main className="page">
        <header className="page__header">
          <h1>稽核紀錄</h1>
          <p>記錄後台服務、時段與預約的重要異動。</p>
        </header>

        {response.data.length > 0 ? (
          <div className="grid">
            {response.data.map((log) => (
              <AuditLogCard key={log.id} log={log} />
            ))}
          </div>
        ) : (
          <EmptyState title="尚無稽核紀錄" description="後台建立或更新資料後會產生紀錄。" />
        )}
      </main>
    );
  } catch (error) {
    return (
      <main className="page">
        <ErrorState title="稽核紀錄無法載入" description={getAdminErrorMessage(error)} />
      </main>
    );
  }
}

// 顯示單筆 audit log 摘要，metadata 以精簡 JSON 呈現方便驗證。
function AuditLogCard({ log }: { log: AdminAuditLog }) {
  return (
    <article className="card">
      <h2>{log.action}</h2>
      <p>
        {log.targetType}：{log.targetId ?? '無'}
      </p>
      <p>操作者：{log.actorUserId ?? '系統'}</p>
      <p>時間：{formatDateTime(log.createdAt)}</p>
      {log.metadata ? <pre>{JSON.stringify(log.metadata, null, 2)}</pre> : null}
    </article>
  );
}

// 以台灣時區顯示稽核紀錄時間。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value));
}