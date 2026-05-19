import { cookies } from 'next/headers';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { AdminAvailabilitySlot, getAdminAvailabilitySlots } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';

export const dynamic = 'force-dynamic';

// 顯示後台時段列表，後台可查看所有服務狀態下的時段。
export default async function AdminAvailabilityPage() {
  try {
    const response = await getAdminAvailabilitySlots({ cookieHeader: (await cookies()).toString() });

    return (
      <main className="page">
        <header className="page__header">
          <h1>時段管理</h1>
          <p>可透過 Admin API 建立、更新與批次產生時段。</p>
        </header>

        {response.data.length > 0 ? (
          <div className="grid">
            {response.data.map((slot) => (
              <SlotCard key={slot.id} slot={slot} />
            ))}
          </div>
        ) : (
          <EmptyState title="尚未建立時段" description="可先建立 active 服務，再建立或批次產生時段。" />
        )}
      </main>
    );
  } catch (error) {
    return (
      <main className="page">
        <ErrorState title="時段資料無法載入" description={getAdminErrorMessage(error)} />
      </main>
    );
  }
}

// 顯示後台時段卡片，包含服務資訊與目前時段狀態。
function SlotCard({ slot }: { slot: AdminAvailabilitySlot }) {
  return (
    <article className="card">
      <h2>{slot.service.name}</h2>
      <p>
        {formatDateTime(slot.startAt)} 至 {formatDateTime(slot.endAt)}
      </p>
      <p>
        服務狀態：{slot.service.status} · 時段狀態：{slot.status}
      </p>
    </article>
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