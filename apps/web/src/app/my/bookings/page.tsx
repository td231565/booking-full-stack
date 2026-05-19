import { BookingsList } from './bookings-list';

export const dynamic = 'force-dynamic';

// 顯示我的預約列表，私人資料頁固定為 dynamic 避免共享快取。
export default function MyBookingsPage() {
  return (
    <main className="page">
      <h1>我的預約</h1>
      <BookingsList />
    </main>
  );
}
