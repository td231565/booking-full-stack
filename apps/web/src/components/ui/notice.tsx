import type { ReactNode } from 'react';

type NoticeProps = {
  children: ReactNode;
  variant?: 'info' | 'warning';
};

// 顯示非阻斷提示，例如服務暫停或取消限制說明。
export function Notice({ children, variant = 'warning' }: NoticeProps) {
  const styles =
    variant === 'warning' ? 'border-warning/30 bg-warning-bg text-warning' : 'border-border bg-surface text-ink-muted';

  return <p className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${styles}`}>{children}</p>;
}
