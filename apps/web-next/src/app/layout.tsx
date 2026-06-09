import type { Metadata } from 'next';
import { IBM_Plex_Sans, Noto_Sans_TC, Geist } from 'next/font/google';
import { HydrationWrapper } from '@/components/hydration-wrapper';
import './globals.css';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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

// 建立全站最外層骨架與字型，供所有路由群組共用。
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body className={cn("min-h-screen font-sans", ibmPlexSans.variable, notoSansTC.variable, geist.variable)}>
        <HydrationWrapper>
          {children}
        </HydrationWrapper>
      </body>
    </html>
  );
}
