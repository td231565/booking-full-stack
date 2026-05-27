import { Request } from 'express';

// 從 Cookie header 解析指定名稱的 session token，供 controller 與 guard 共用。
export function readSessionTokenFromRequest(request: Request, cookieName: string): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`));

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : undefined;
}
