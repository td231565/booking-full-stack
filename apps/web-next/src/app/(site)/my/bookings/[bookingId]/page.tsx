import { Suspense } from 'react';
import { BookingDetailClient } from './booking-detail';
import { Page } from '@/components/ui/page';
import { LoadingState } from '@/components/ui/status-state';

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
    <Page>
      {/* useSearchParams 需包在 Suspense 邊界內（Next.js 要求）。 */}
      <Suspense fallback={<LoadingState title="正在載入預約詳情" description="請稍候。" />}>
        <BookingDetailClient bookingId={bookingId} />
      </Suspense>
    </Page>
  );
}
