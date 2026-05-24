import { cookies } from 'next/headers';
import { Page, PageHeader, Panel } from '@/components/ui/page';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { AdminAuditLog, getAdminAuditLogs } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';

export const dynamic = 'force-dynamic';

// 顯示後台稽核紀錄列表，查詢類 Admin API 不會額外寫入 audit log。
export default async function AdminAuditLogsPage() {
  try {
    const response = await getAdminAuditLogs({ cookieHeader: (await cookies()).toString() });

    return (
      <Page>
        <PageHeader description="記錄後台服務、時段與預約的重要異動。" title="稽核紀錄" />

        {response.data.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {response.data.map((log) => (
              <li key={log.id}>
                <AuditLogCard log={log} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="尚無稽核紀錄" description="後台建立或更新資料後會產生紀錄。" />
        )}
      </Page>
    );
  } catch (error) {
    return (
      <Page>
        <ErrorState title="稽核紀錄無法載入" description={getAdminErrorMessage(error)} />
      </Page>
    );
  }
}

// 顯示單筆 audit log 摘要，metadata 以精簡 JSON 呈現方便驗證。
function AuditLogCard({ log }: { log: AdminAuditLog }) {
  return (
    <Panel>
      <h2 className="text-base font-semibold text-ink">{log.action}</h2>
      <p className="mt-2 text-sm text-ink-muted">
        {log.targetType}：{log.targetId ?? '無'}
      </p>
      <p className="mt-1 text-sm text-ink-muted">操作者：{log.actorUserId ?? '系統'}</p>
      <p className="mt-1 text-sm text-ink">時間：{formatDateTime(log.createdAt)}</p>
      {log.metadata ? (
        <pre className="mt-4 overflow-x-auto rounded-md bg-surface p-3 text-xs text-ink-muted">{JSON.stringify(log.metadata, null, 2)}</pre>
      ) : null}
    </Panel>
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
