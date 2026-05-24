import { cookies } from 'next/headers';
import { BookingStatusBadge } from '@/components/ui/badge';
import { Page, PageHeader, Panel } from '@/components/ui/page';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { AdminBooking, getAdminBookings } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';

export const dynamic = 'force-dynamic';

// 顯示後台預約列表，Admin 可查看所有會員預約。
export default async function AdminBookingsPage() {
  try {
    const response = await getAdminBookings({ cookieHeader: (await cookies()).toString() });

    return (
      <Page>
        <PageHeader description="可透過 Admin API 替會員建立、更新備註與取消預約。" title="預約管理" />

        {response.data.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {response.data.map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="目前沒有預約" description="建立預約後會出現在這裡。" />
        )}
      </Page>
    );
  } catch (error) {
    return (
      <Page>
        <ErrorState title="預約資料無法載入" description={getAdminErrorMessage(error)} />
      </Page>
    );
  }
}

// 顯示後台預約卡片，包含會員、服務與對外預約狀態。
function BookingCard({ booking }: { booking: AdminBooking }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{booking.service.name}</h2>
        <BookingStatusBadge status={booking.status} />
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        {booking.user.displayName}（{booking.user.email}）
      </p>
      <p className="mt-2 text-sm text-ink">
        {formatDateTime(booking.slot.startAt)} 至 {formatDateTime(booking.slot.endAt)}
      </p>
      {booking.note ? <p className="mt-2 text-sm text-ink-muted">備註：{booking.note}</p> : null}
    </Panel>
  );
}

// 以台灣時區顯示預約時間。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value));
}
