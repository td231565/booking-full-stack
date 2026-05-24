import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Page, Panel } from '@/components/ui/page';

// 顯示公開首頁，提供服務列表與登入流程的主要入口。
export default function HomePage() {
  return (
    <Page>
      <Panel className="max-w-prose">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">預約排程</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">選服務、選時段、完成預約</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          瀏覽公開服務與可預約時段；登入後可建立預約、查看與管理自己的預約紀錄。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/services">查看服務</ButtonLink>
          <Link className="inline-flex items-center rounded-md px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent-soft" href="/login">
            登入
          </Link>
        </div>
      </Panel>
    </Page>
  );
}
