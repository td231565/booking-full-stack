import Link from 'next/link';

type PaginationProps = {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
  label?: string;
};

// 顯示列表分頁導覽，僅在超過一頁時由呼叫端決定是否渲染。
export function Pagination({ page, totalPages, buildHref, label = '列表分頁' }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label={label} className="mt-10 flex items-center justify-center gap-6 text-sm">
      {page > 1 ? (
        <Link className="font-medium text-accent hover:text-accent-hover" href={buildHref(page - 1)}>
          上一頁
        </Link>
      ) : (
        <span className="text-ink-muted/50">上一頁</span>
      )}
      <span className="text-ink-muted">
        第 {page} / {totalPages} 頁
      </span>
      {page < totalPages ? (
        <Link className="font-medium text-accent hover:text-accent-hover" href={buildHref(page + 1)}>
          下一頁
        </Link>
      ) : (
        <span className="text-ink-muted/50">下一頁</span>
      )}
    </nav>
  );
}
