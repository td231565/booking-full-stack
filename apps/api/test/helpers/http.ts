import { Response } from 'supertest';

const SESSION_COOKIE_NAME = 'booking_session';

// 從 supertest 回應解析 booking_session cookie 值，供後續請求帶入 Cookie header。
export function parseSessionCookie(response: Response): string | null {
  const setCookie = response.headers['set-cookie'];

  if (!setCookie) {
    return null;
  }

  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const target = cookies.find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!target) {
    return null;
  }

  const rawValue = target.split(';')[0].slice(SESSION_COOKIE_NAME.length + 1);

  return decodeURIComponent(rawValue);
}

// 將 session token 組成 Cookie header，模擬瀏覽器帶入 HttpOnly cookie。
export function sessionCookieHeader(sessionToken: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
}
