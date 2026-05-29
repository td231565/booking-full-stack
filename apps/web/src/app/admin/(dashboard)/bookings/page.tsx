import { cookies } from 'next/headers';
import { Page, PageHeader } from '@/components/ui/page';
import { ErrorState } from '@/components/ui/status-state';
import { getAdminBookingsByDateRange } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';
import { getMonthDateRange } from '@/lib/admin/admin-date-utils';
import { BookingsCalendar } from './bookings-calendar';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

// 顯示後台預約管理頁面，包含日曆與預約列表。
export default async function AdminBookingsPage({ searchParams }: PageProps) {
  const { month } = await searchParams;
  const currentMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM
  const { from, to } = getMonthDateRange(currentMonth);

  try {
    const response = await getAdminBookingsByDateRange(from, to);

    return (
      <Page className="max-w-6xl">
        <PageHeader description="可在此查看月份預約、改期或取消預約。" title="預約管理" />

        <BookingsCalendar initialBookings={response.data} month={currentMonth} />
      </Page>
    );
  } catch (error) {
    return (
      <Page className="max-w-6xl">
        <ErrorState title="預約資料無法載入" description={getAdminErrorMessage(error)} />
      </Page>
    );
  }
}
