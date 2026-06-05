import { http, HttpResponse } from 'msw';
import { server } from '../../../test/msw/server';
import { apiFetch, ApiClientError } from './client';

describe('apiFetch', () => {
  // 2xx 回應應直接回傳解析後的 body，不拋任何錯誤。
  it('2xx 回應時正確解析並回傳 body', async () => {
    server.use(
      http.get('http://127.0.0.1:3001/api/auth/me', () => {
        return HttpResponse.json({ data: { id: 'user-1', email: 'user@example.com' } });
      }),
    );

    const result = await apiFetch('/api/auth/me');

    expect(result).toEqual({ data: { id: 'user-1', email: 'user@example.com' } });
  });

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

  // 5xx 也屬於 !response.ok，同樣應轉成 ApiClientError。
  it('API 回 5xx 時拋 ApiClientError', async () => {
    server.use(
      http.get('http://127.0.0.1:3001/api/auth/me', () => {
        return HttpResponse.json(
          { error: { code: 'INTERNAL_SERVER_ERROR', message: '伺服器錯誤' } },
          { status: 500 },
        );
      }),
    );

    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 500,
    });
  });

  // 錯誤 body 為合法 JSON 但不符合 error shape 時，應 fallback 為 INTERNAL_ERROR。
  it('錯誤 body 不符合 error shape 時 code fallback 為 INTERNAL_ERROR', async () => {
    server.use(
      http.get('http://127.0.0.1:3001/api/auth/me', () => {
        // 合法 JSON 但沒有 error.code / error.message 結構。
        return HttpResponse.json({ message: 'unexpected error format' }, { status: 503 });
      }),
    );

    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INTERNAL_ERROR',
      status: 503,
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
