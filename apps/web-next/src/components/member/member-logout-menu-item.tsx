'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from 'swr';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api/client';
import { MEMBER_AUTH_SWR_KEY } from '@/lib/auth/use-current-member-user';

// 顯示會員登出選項，清除 session 後刷新 header 並導回首頁。
export function MemberLogoutMenuItem() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 呼叫後端 logout 清除 HttpOnly cookie，並讓 SWR 立即回到未登入狀態。
  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      await mutate(MEMBER_AUTH_SWR_KEY, null, { revalidate: false });
      router.push('/');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DropdownMenuItem disabled={isSubmitting} onClick={() => void handleLogout()} variant="destructive">
      {isSubmitting ? '登出中...' : '登出'}
    </DropdownMenuItem>
  );
}
