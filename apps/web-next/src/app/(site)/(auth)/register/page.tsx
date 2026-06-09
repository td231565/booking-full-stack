import { RegisterForm } from './register-form';
import { Page, PageHeader, Panel } from '@/components/ui/page';

// 顯示註冊頁並串接會員註冊流程。
export default function RegisterPage() {
  return (
    <Page>
      <Panel className="mx-auto max-w-md">
        <PageHeader className="mb-0" description="註冊後可使用會員預約功能。" title="註冊" />
        <RegisterForm />
      </Panel>
    </Page>
  );
}
