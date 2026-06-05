import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type ButtonProps = ComponentProps<'button'> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
};

const variantClasses = {
  primary:
    'bg-accent text-elevated hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'border border-border bg-elevated text-ink hover:border-ink-muted/40 disabled:cursor-not-allowed disabled:opacity-60',
  ghost: 'text-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
};

// 渲染主要互動按鈕，統一焦點與 disabled 樣式。
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-semibold transition-colors duration-200 ease-out ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
};

// 將連結樣式為按鈕，用於頁面內導向動作。
export function ButtonLink({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={`inline-flex items-center justify-center rounded-md font-semibold transition-colors duration-200 ease-out ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}
