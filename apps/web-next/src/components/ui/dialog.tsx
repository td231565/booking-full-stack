'use client';

import { useEffect, useId, type ReactNode } from 'react';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
};

// 輕量 Dialog：支援 Esc 關閉、背景點擊關閉與基本無障礙屬性。
export function Dialog({ open, onOpenChange, title, children }: DialogProps) {
  const titleId = useId();

  // Esc 關閉，避免使用者被困在遮罩內。
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="關閉對話框"
        className="fixed inset-0 bg-ink/40"
        onClick={() => onOpenChange(false)}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-elevated p-6 shadow-lg"
        role="dialog"
      >
        <h2 className="text-lg font-semibold text-ink" id={titleId}>
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
