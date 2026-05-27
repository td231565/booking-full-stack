import { ApiSuccessResponse, apiFetch } from '@/lib/api/client';

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
};

export type SessionAudience = 'member' | 'admin';

// 依 audience 回傳對應的 me 端點路徑。
function getMePath(audience: SessionAudience): string {
  return audience === 'admin' ? '/api/admin/auth/me' : '/api/auth/me';
}

// 透過會員 session 查詢目前登入者。
export async function getCurrentMemberUser(): Promise<CurrentUser | null> {
  return getCurrentUserFromCookieHeader(undefined, 'member');
}

// 透過後台 session 查詢目前登入的管理員。
export async function getCurrentAdminUser(): Promise<CurrentUser | null> {
  return getCurrentUserFromCookieHeader(undefined, 'admin');
}

// 向後相容：預設查詢會員 session。
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getCurrentMemberUser();
}

// 在 Server Component 轉送 Cookie header 查詢登入者，可依 audience 區分前台／後台。
export async function getCurrentUserFromCookieHeader(
  cookieHeader: string | undefined,
  audience: SessionAudience = 'member',
): Promise<CurrentUser | null> {
  try {
    const response = await apiFetch<ApiSuccessResponse<CurrentUser>>(getMePath(audience), {
      cache: 'no-store',
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
    });

    return response.data;
  } catch {
    return null;
  }
}

// 後台 layout 專用：只認 admin session。
export async function getCurrentAdminUserFromCookieHeader(cookieHeader: string | undefined): Promise<CurrentUser | null> {
  return getCurrentUserFromCookieHeader(cookieHeader, 'admin');
}
