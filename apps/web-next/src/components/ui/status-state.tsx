import { Panel } from '@/components/ui/page';

type StatusStateProps = {
  title: string;
  description?: string;
};

// 顯示資料載入中的共用狀態，讓各頁面先有一致 loading 呈現。
export function LoadingState({ title, description }: StatusStateProps) {
  return (
    <Panel aria-busy="true">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-2 text-sm text-ink-muted">{description}</p> : null}
    </Panel>
  );
}

// 顯示查無資料的共用狀態，讓列表頁可重複使用同一個 empty UI。
export function EmptyState({ title, description }: StatusStateProps) {
  return (
    <Panel>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-2 text-sm text-ink-muted">{description}</p> : null}
    </Panel>
  );
}

// 顯示 API 或權限錯誤的共用狀態，後續可依 error.code 放入穩定訊息。
export function ErrorState({ title, description }: StatusStateProps) {
  return (
    <Panel role="alert">
      <h2 className="text-lg font-semibold text-danger">{title}</h2>
      {description ? <p className="mt-2 text-sm text-ink-muted">{description}</p> : null}
    </Panel>
  );
}
