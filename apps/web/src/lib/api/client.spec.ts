import { http, HttpResponse } from 'msw';
import { server } from '../../../test/msw/server';
import { apiFetch, ApiClientError } from './client';

describe('apiFetch', () => {
  // 4xx 回應應轉成 ApiClientError，讓 UI 可依穩定 error.code 顯示訊息。
  it('API 回 4xx 時拋 ApiClientError 且含正確 code', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/login', () => {
        return HttpResponse.json(
          {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: '帳號或密碼錯誤。',
            },
          },
          { status: 401 },
        );
      }),
    );

    await expect(
      apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'wrong-password' }),
      }),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
  });

  // 網路層失敗不應被誤判為 ApiClientError，避免 UI 顯示錯誤的業務訊息。
  it('網路錯誤時拋非 ApiClientError', async () => {
    server.use(http.post('http://127.0.0.1:3001/api/auth/login', () => HttpResponse.error()));

    await expect(
      apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      }),
    ).rejects.not.toBeInstanceOf(ApiClientError);
  });
});
