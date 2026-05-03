import Link from 'next/link';

// 顯示公開首頁骨架，提供服務列表與登入流程的主要入口。
export default function HomePage() {
  return (
    <main className="page">
      <section className="card">
        <h1>預約排程系統</h1>
        <p>公開服務瀏覽、會員預約與後台管理的 MVP 骨架。</p>
        <Link href="/services">查看服務</Link>
      </section>
    </main>
  );
}
