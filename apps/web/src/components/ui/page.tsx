import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type PageProps = {
  children: ReactNode;
  className?: string;
};

// 統一頁面寬度與垂直節奏，讓各路由共用一致版面。
export function Page({ children, className = '' }: PageProps) {
  return <main className={`mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14 ${className}`}>{children}</main>;
}

type PageHeaderProps = {
  title: string;
  description?: string;
  className?: string;
};

// 顯示頁面標題與簡短說明，控制行長以利繁中閱讀。
export function PageHeader({ title, description, className = '' }: PageHeaderProps) {
  return (
    <header className={`mb-8 max-w-prose ${className}`}>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {description ? <p className="mt-2 text-base leading-relaxed text-ink-muted">{description}</p> : null}
    </header>
  );
}

type PanelProps = {
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<'section'>;

// 提供卡片式內容區塊，用於表單與重點資訊。
export function Panel({ children, className = '', ...props }: PanelProps) {
  return (
    <section className={`rounded-lg border border-border bg-elevated p-6 shadow-sm sm:p-8 ${className}`} {...props}>
      {children}
    </section>
  );
}
