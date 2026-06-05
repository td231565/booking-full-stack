import type { ComponentProps, ReactNode } from 'react';

type FormProps = ComponentProps<'form'>;

// 表單垂直間距，用於登入、註冊與取消預約。
export function Form({ children, className = '', ...props }: FormProps) {
  return (
    <form className={`mt-6 flex flex-col gap-5 ${className}`} {...props}>
      {children}
    </form>
  );
}

type FormFieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

// 表單欄位標籤與輸入區塊，維持可存取性關聯。
export function FormField({ label, children, className = '' }: FormFieldProps) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-medium text-ink ${className}`}>
      {label}
      {children}
    </label>
  );
}

type TextInputProps = ComponentProps<'input'>;

// 統一輸入框樣式，與全站邊框與焦點環一致。
export function TextInput({ className = '', ...props }: TextInputProps) {
  return (
    <input
      className={`w-full rounded-md border border-border bg-elevated px-3 py-2.5 text-base text-ink placeholder:text-ink-muted/70 ${className}`}
      {...props}
    />
  );
}

// 顯示表單或 API 錯誤訊息，使用語意 role 與危險色。
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-danger" role="alert">
      {children}
    </p>
  );
}
