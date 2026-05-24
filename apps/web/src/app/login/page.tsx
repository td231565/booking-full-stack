import { LoginForm } from './login-form';
import { Page, PageHeader, Panel } from '@/components/ui/page';

type LoginPageProps = {
  searchParams?: Promise<{
    redirect?: string;
  }>;
};

// 顯示登入頁並提供 redirect 流程，登入成功後回到原本操作入口。
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const redirectTo = normalizeRedirect((await searchParams)?.redirect);

  return (
    <Page>
      <Panel className="max-w-md mx-auto">
        <PageHeader className="mb-0" description="登入後即可建立預約與查看自己的預約。" title="登入" />
        <LoginForm redirectTo={redirectTo} />
      </Panel>
    </Page>
  );
}

// 限制 redirect 只能導向站內路徑，避免登入後被導向外部網站。
function normalizeRedirect(value: string | undefined): string {
  if (value?.startsWith('/')) {
    return value;
  }

  return '/my/bookings';
}
