'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';

// 顯示後台登出按鈕，清除 session 後導回後台登入頁。
export function AdminLogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 呼叫後端 logout 清除 HttpOnly cookie，避免登出後仍能存取後台。
  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await apiFetch('/api/admin/auth/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      className="w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-white/70 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white disabled:opacity-60"
      disabled={isSubmitting}
      onClick={handleLogout}
      type="button"
    >
      {isSubmitting ? '登出中...' : '登出'}
    </button>
  );
}
