import Link from 'next/link';

export const dynamic = 'force-dynamic';

// 顯示後台首頁，後台頁固定為 dynamic 避免共享快取。
export default function AdminHomePage() {
  return (
    <main className="page">
      <section className="card">
        <h1>後台管理</h1>
        <p>後台 API 會在後端檢查 admin 權限，非管理員無法取得資料。</p>
        <div className="grid">
          <Link href="/admin/services">服務管理</Link>
          <Link href="/admin/availability">時段管理</Link>
          <Link href="/admin/bookings">預約管理</Link>
          <Link href="/admin/audit-logs">稽核紀錄</Link>
        </div>
      </section>
    </main>
  );
}
