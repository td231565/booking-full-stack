import Link from 'next/link';

export const dynamic = 'force-dynamic';

// 顯示後台首頁骨架，後台頁先固定為 dynamic 避免共享快取。
export default function AdminHomePage() {
  return (
    <main className="page">
      <section className="card">
        <h1>後台管理</h1>
        <p>後續會在此確認登入狀態與 admin 權限。</p>
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
