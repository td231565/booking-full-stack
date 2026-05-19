import { BookingDetailClient } from './booking-detail';

type MyBookingDetailPageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

export const dynamic = 'force-dynamic';

// 顯示我的預約詳情，私人資料頁固定為 dynamic 避免共享快取。
export default async function MyBookingDetailPage({ params }: MyBookingDetailPageProps) {
  const { bookingId } = await params;

  return (
    <main className="page">
      <BookingDetailClient bookingId={bookingId} />
    </main>
  );
}
