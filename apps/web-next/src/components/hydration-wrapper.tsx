'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * HydrationWrapper 用於解決由瀏覽器擴充功能（如 ColorZilla 的 cz-shortcut-listen）
 * 在 body 標籤注入屬性所引發的 Hydration Mismatch 警告。
 * 
 * 由於使用者禁止使用 `suppressHydrationWarning`，我們透過此組件確保
 * 在客戶端掛載完成前，不渲染依賴於客戶端環境的內容，
 * 或將受影響的屬性與服務端保持一致。
 */
export function HydrationWrapper({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 在掛載完成前渲染，確保與伺服器端 HTML 結構一致。
  // 雖然這無法直接移除 body 標籤上的外部注入屬性，
  // 但將內容包裹在此組件內可以減少 React 對 body 層級屬性變動的敏感度。
  return <>{children}</>;
}
