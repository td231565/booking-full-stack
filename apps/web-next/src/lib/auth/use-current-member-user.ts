'use client';

import useSWR from 'swr';
import { ApiClientError, ApiSuccessResponse, apiFetch } from '@/lib/api/client';
import { CurrentUser } from '@/lib/auth/get-current-user';

export const MEMBER_AUTH_SWR_KEY = 'member-auth-me';

// 向後端查詢目前會員 session，401 視為未登入。
async function fetchCurrentMemberUser(): Promise<CurrentUser | null> {
  try {
    const response = await apiFetch<ApiSuccessResponse<CurrentUser>>('/api/auth/me', {
      cache: 'no-store',
    });

    return response.data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

// 在 Client Component 追蹤會員登入狀態，供 header 與登出後刷新 UI。
export function useCurrentMemberUser() {
  const { data, error, isLoading, mutate } = useSWR(MEMBER_AUTH_SWR_KEY, fetchCurrentMemberUser, {
    revalidateOnFocus: true,
  });

  return {
    user: data ?? null,
    isLoading,
    isAuthenticated: data != null,
    error,
    mutate,
  };
}
