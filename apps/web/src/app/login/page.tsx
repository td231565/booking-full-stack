import Link from 'next/link';

// 顯示登入頁骨架，Phase 4 會加入表單與 POST /api/auth/login 串接。
export default function LoginPage() {
  return (
    <main className="page">
      <section className="card">
        <h1>登入</h1>
        <p>此頁後續會處理登入表單、錯誤碼與 redirect 流程。</p>
        <Link href="/register">前往註冊</Link>
      </section>
    </main>
  );
}
