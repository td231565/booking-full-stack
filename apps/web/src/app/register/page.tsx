import { RegisterForm } from './register-form';

// 顯示註冊頁並串接會員註冊流程。
export default function RegisterPage() {
  return (
    <main className="page">
      <section className="card">
        <h1>註冊</h1>
        <p>註冊後可使用會員預約功能。</p>
        <RegisterForm />
      </section>
    </main>
  );
}
