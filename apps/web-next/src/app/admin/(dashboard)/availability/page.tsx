import { cookies } from 'next/headers';
import { AdminServiceStatusBadge } from '@/components/ui/badge';
import { Page, PageHeader, Panel } from '@/components/ui/page';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { AdminAvailabilitySlot, getAdminAvailabilitySlots } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';

export const dynamic = 'force-dynamic';

// 顯示後台時段列表，後台可查看所有服務狀態下的時段。
export default async function AdminAvailabilityPage() {
  try {
    const response = await getAdminAvailabilitySlots({ cookieHeader: (await cookies()).toString() });

    return (
      <Page className="max-w-5xl">
        <PageHeader description="可透過 Admin API 建立、更新與批次產生時段。" title="時段管理" />

        {response.data.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {response.data.map((slot) => (
              <li key={slot.id}>
                <SlotCard slot={slot} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="尚未建立時段" description="可先建立 active 服務，再建立或批次產生時段。" />
        )}
      </Page>
    );
  } catch (error) {
    return (
      <Page className="max-w-5xl">
        <ErrorState title="時段資料無法載入" description={getAdminErrorMessage(error)} />
      </Page>
    );
  }
}

// 顯示後台時段卡片，包含服務資訊與目前時段狀態。
function SlotCard({ slot }: { slot: AdminAvailabilitySlot }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{slot.service.name}</h2>
        <AdminServiceStatusBadge status={slot.service.status} />
      </div>
      <p className="mt-3 text-sm text-ink">
        {formatDateTime(slot.startAt)} 至 {formatDateTime(slot.endAt)}
      </p>
      <p className="mt-2 text-sm text-ink-muted">時段狀態：{slot.status}</p>
    </Panel>
  );
}

// 以台灣時區顯示時段時間，符合前端依使用者時區顯示的規則。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value));
}
