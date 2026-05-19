import { cookies } from 'next/headers';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { AdminBooking, getAdminBookings } from '@/lib/admin/admin-api';
import { ApiClientError } from '@/lib/api/client';

export const dynamic = 'force-dynamic';

// 顯示後台預約列表，Admin 可查看所有會員預約。
export default async function AdminBookingsPage() {
  try {
    const response = await getAdminBookings({ cookieHeader: (await cookies()).toString() });

    return (
      <main className="page">
        <header className="page__header">
          <h1>預約管理</h1>
          <p>可透過 Admin API 替會員建立、更新備註與取消預約。</p>
        </header>

        {response.data.length > 0 ? (
          <div className="grid">
            {response.data.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        ) : (
          <EmptyState title="目前沒有預約" description="建立預約後會出現在這裡。" />
        )}
      </main>
    );
  } catch (error) {
    return (
      <main className="page">
        <ErrorState title="預約資料無法載入" description={getErrorMessage(error)} />
      </main>
    );
  }
}

// 顯示後台預約卡片，包含會員、服務與對外預約狀態。
function BookingCard({ booking }: { booking: AdminBooking }) {
  return (
    <article className="card">
      <h2>{booking.service.name}</h2>
      <p>
        {booking.user.displayName}（{booking.user.email}）
      </p>
      <p>
        {formatDateTime(booking.slot.startAt)} 至 {formatDateTime(booking.slot.endAt)}
      </p>
      <p>狀態：{formatBookingStatus(booking.status)}</p>
      {booking.note ? <p>備註：{booking.note}</p> : null}
    </article>
  );
}

// 將預約狀態轉成後台易讀文字。
function formatBookingStatus(status: AdminBooking['status']): string {
  const labels = {
    confirmed: '已成立',
    cancelled: '已取消',
    completed: '已完成',
  };

  return labels[status];
}

// 以台灣時區顯示預約時間。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value));
}

// 將 API 錯誤轉為頁面可讀訊息，未知錯誤使用通用提示。
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return '請稍後再試。';
}
