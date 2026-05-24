'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Form, FormError, FormField, TextInput } from '@/components/ui/form';
import { ApiClientError, ApiSuccessResponse, apiFetch } from '@/lib/api/client';
import { CurrentUser } from '@/lib/auth/get-current-user';

type LoginFormProps = {
  redirectTo: string;
};

// 顯示登入表單並串接 POST /api/auth/login，成功後導向原本要前往的頁面。
export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 送出登入資料，session cookie 由後端以 HttpOnly Set-Cookie 寫入。
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await apiFetch<ApiSuccessResponse<CurrentUser>>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      });
      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit}>
      <FormField label="Email">
        <TextInput autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
      </FormField>
      <FormField label="密碼">
        <TextInput
          autoComplete="current-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </FormField>
      {errorMessage ? <FormError>{errorMessage}</FormError> : null}
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? '登入中...' : '登入'}
      </Button>
      <p className="text-sm text-ink-muted">
        尚未有帳號？{' '}
        <Link className="font-medium text-accent hover:text-accent-hover" href="/register">
          前往註冊
        </Link>
      </p>
    </Form>
  );
}

// 將登入錯誤碼轉為穩定 UI 訊息，避免直接顯示不明例外。
function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return '帳號或密碼錯誤。';
    }

    if (error.code === 'USER_DISABLED') {
      return '此帳號已停用。';
    }

    if (error.code === 'RATE_LIMITED') {
      return '登入太頻繁，請稍後再試。';
    }

    return error.message;
  }

  return '系統暫時無法處理請求。';
}
