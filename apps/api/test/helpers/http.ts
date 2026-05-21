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

// 取得回應中所有 Set-Cookie header，供 cookie 屬性斷言使用。
export function getSetCookieHeaders(response: Response): string[] {
  const setCookie = response.headers['set-cookie'];

  if (!setCookie) {
    return [];
  }

  return Array.isArray(setCookie) ? setCookie : [setCookie];
}

// 找出 booking_session 的 Set-Cookie 字串。
export function findSessionSetCookie(response: Response): string | undefined {
  return getSetCookieHeaders(response).find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
}

// 驗證 login 回傳的 session cookie 具備 HttpOnly 與 SameSite=Lax。
export function expectSessionCookieSecurityAttributes(response: Response): void {
  const cookie = findSessionSetCookie(response);

  expect(cookie).toBeTruthy();
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
}

// 驗證 logout 回傳的 Set-Cookie 會清除 session（Max-Age=0 或過期時間）。
export function expectSessionCookieCleared(response: Response): void {
  const cleared = getSetCookieHeaders(response).some(
    (item) =>
      item.startsWith(`${SESSION_COOKIE_NAME}=`) &&
      (/Max-Age=0/i.test(item) || /Expires=Thu,\s*01\s+Jan\s+1970/i.test(item)),
  );

  expect(cleared).toBe(true);
}
