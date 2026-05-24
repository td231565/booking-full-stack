import { BookingsList } from './bookings-list';
import { Page, PageHeader } from '@/components/ui/page';

export const dynamic = 'force-dynamic';

// 顯示我的預約列表，私人資料頁固定為 dynamic 避免共享快取。
export default function MyBookingsPage() {
  return (
    <Page>
      <PageHeader description="查看與管理你的預約紀錄。" title="我的預約" />
      <BookingsList />
    </Page>
  );
}
