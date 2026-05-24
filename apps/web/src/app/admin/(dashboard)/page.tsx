import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// 後台根路由預設導向預約管理。
export default function AdminDashboardIndexPage() {
  redirect('/admin/bookings');
}
