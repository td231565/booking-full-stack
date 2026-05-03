import { ApiSuccessResponse, apiFetch } from '@/lib/api/client';

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
};

// 透過後端 session 查詢目前登入者，前端不直接讀取 HttpOnly Cookie。
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const response = await apiFetch<ApiSuccessResponse<CurrentUser>>('/api/auth/me', {
      cache: 'no-store',
    });

    return response.data;
  } catch {
    return null;
  }
}
