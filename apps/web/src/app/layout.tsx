import type { Metadata } from 'next';
import { IBM_Plex_Sans, Noto_Sans_TC } from 'next/font/google';
import { SiteHeader } from '@/components/site-header';
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
          <SiteHeader />
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
