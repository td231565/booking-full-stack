import Link from 'next/link';

// 顯示註冊頁骨架，Phase 4 會加入表單與 POST /api/auth/register 串接。
export default function RegisterPage() {
  return (
    <main className="page">
      <section className="card">
        <h1>註冊</h1>
        <p>此頁後續會處理 email、password、displayName 的註冊流程。</p>
        <Link href="/login">已有帳號，前往登入</Link>
      </section>
    </main>
  );
}
