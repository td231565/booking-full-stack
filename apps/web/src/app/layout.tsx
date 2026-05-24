import type { Metadata } from 'next';
import { IBM_Plex_Sans, Noto_Sans_TC } from 'next/font/google';
import Link from 'next/link';
import { NavLink } from '@/components/ui/nav-link';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  weight: ['400', '500', '600', '700'],
});

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  variable: '--font-zh',
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: '預約排程系統',
  description: '預約排程系統 MVP',
};

// 建立全站基本版面與主要導覽，讓公開頁、會員頁與後台頁共用一致入口。
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${ibmPlexSans.variable} ${notoSansTC.variable}`} lang="zh-Hant-TW">
      <body className="min-h-screen">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-10 border-b border-border bg-elevated/95 backdrop-blur-sm">
            <nav aria-label="主要導覽" className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
              <Link className="mr-auto text-base font-bold tracking-tight text-ink" href="/">
                預約排程
              </Link>
              <NavLink href="/services">服務</NavLink>
              <NavLink href="/my/bookings">我的預約</NavLink>
              <NavLink href="/admin">後台</NavLink>
            </nav>
          </header>
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
