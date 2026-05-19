'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiClientError, ApiSuccessResponse, apiFetch } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/error-messages';
import { CurrentUser } from '@/lib/auth/get-current-user';

// 顯示註冊表單並串接 POST /api/auth/register，成功後導向登入頁。
export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 送出註冊資料，後端會固定建立 active user 並排除 passwordHash 回應。
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await apiFetch<ApiSuccessResponse<CurrentUser>>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          displayName,
        }),
      });
      router.push('/login');
    } catch (error) {
      setErrorMessage(getRegisterErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label className="form-field">
        Email
        <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
      </label>
      <label className="form-field">
        顯示名稱
        <input
          autoComplete="name"
          maxLength={100}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          type="text"
          value={displayName}
        />
      </label>
      <label className="form-field">
        密碼
        <input
          autoComplete="new-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      <button className="button-link" disabled={isSubmitting} type="submit">
        {isSubmitting ? '註冊中...' : '註冊'}
      </button>
      <p>
        已有帳號？<Link href="/login">前往登入</Link>
      </p>
    </form>
  );
}

// 將註冊錯誤碼轉為穩定 UI 訊息，讓使用者知道下一步。
function getRegisterErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'EMAIL_ALREADY_USED') {
      return '此 email 已被使用。';
    }

    if (error.code === 'VALIDATION_ERROR') {
      return '請確認 email、顯示名稱與密碼格式。';
    }

    return getApiErrorMessage(error);
  }

  return '系統暫時無法處理請求。';
}
