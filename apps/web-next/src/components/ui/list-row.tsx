import type { ReactNode } from 'react';

type ListRowProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

// 列表單列版面，用於時段與預約項目，避免巢狀卡片。
export function ListRow({ children, actions, className = '' }: ListRowProps) {
  return (
    <article className={`flex flex-col gap-4 border-b border-border py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </article>
  );
}

// 時段與預約列表外層容器。
export function ListStack({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-border ${className}`}>{children}</div>;
}
