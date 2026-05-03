import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '預約排程系統',
  description: '預約排程系統 MVP 骨架',
};

// 建立全站基本版面與主要導覽，讓公開頁、會員頁與後台頁共用一致入口。
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <div className="shell">
          <nav className="nav" aria-label="主要導覽">
            <Link className="nav__brand" href="/">
              預約排程
            </Link>
            <Link href="/services">服務</Link>
            <Link href="/my/bookings">我的預約</Link>
            <Link href="/admin">後台</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
