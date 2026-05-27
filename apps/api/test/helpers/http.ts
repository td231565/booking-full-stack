import { Response } from 'supertest';

export type SessionAudience = 'member' | 'admin';

const SESSION_COOKIE_NAMES: Record<SessionAudience, string> = {
  member: 'booking_member_session',
  admin: 'booking_admin_session',
};

// 依 audience 取得對應的 session cookie 名稱。
function getSessionCookieName(audience: SessionAudience): string {
  return SESSION_COOKIE_NAMES[audience];
}

// 從 supertest 回應解析指定 audience 的 session cookie 值，供後續請求帶入 Cookie header。
export function parseSessionCookie(
  response: Response,
  audience: SessionAudience = 'member',
): string | null {
  const cookieName = getSessionCookieName(audience);
  const setCookie = response.headers['set-cookie'];

  if (!setCookie) {
    return null;
  }

  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const target = cookies.find((item) => item.startsWith(`${cookieName}=`));

  if (!target) {
    return null;
  }

  const rawValue = target.split(';')[0].slice(cookieName.length + 1);

  return decodeURIComponent(rawValue);
}

// 將 session token 組成 Cookie header，模擬瀏覽器帶入 HttpOnly cookie。
export function sessionCookieHeader(
  sessionToken: string,
  audience: SessionAudience = 'member',
): string {
  return `${getSessionCookieName(audience)}=${encodeURIComponent(sessionToken)}`;
}

// 取得回應中所有 Set-Cookie header，供 cookie 屬性斷言使用。
export function getSetCookieHeaders(response: Response): string[] {
  const setCookie = response.headers['set-cookie'];

  if (!setCookie) {
    return [];
  }

  return Array.isArray(setCookie) ? setCookie : [setCookie];
}

// 找出指定 audience 的 session Set-Cookie 字串。
export function findSessionSetCookie(
  response: Response,
  audience: SessionAudience = 'member',
): string | undefined {
  const cookieName = getSessionCookieName(audience);
  return getSetCookieHeaders(response).find((item) => item.startsWith(`${cookieName}=`));
}

// 驗證 login 回傳的 session cookie 具備 HttpOnly 與 SameSite=Lax。
export function expectSessionCookieSecurityAttributes(
  response: Response,
  audience: SessionAudience = 'member',
): void {
  const cookie = findSessionSetCookie(response, audience);

  expect(cookie).toBeTruthy();
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
}

// 驗證 logout 回傳的 Set-Cookie 會清除 session（Max-Age=0 或過期時間）。
export function expectSessionCookieCleared(
  response: Response,
  audience: SessionAudience = 'member',
): void {
  const cookieName = getSessionCookieName(audience);
  const cleared = getSetCookieHeaders(response).some(
    (item) =>
      item.startsWith(`${cookieName}=`) &&
      (/Max-Age=0/i.test(item) || /Expires=Thu,\s*01\s+Jan\s+1970/i.test(item)),
  );

  expect(cleared).toBe(true);
}
