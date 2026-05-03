type StatusStateProps = {
  title: string;
  description?: string;
};

// 顯示資料載入中的共用狀態，讓各頁面先有一致 loading 呈現。
export function LoadingState({ title, description }: StatusStateProps) {
  return (
    <section className="card" aria-busy="true">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </section>
  );
}

// 顯示查無資料的共用狀態，讓列表頁可重複使用同一個 empty UI。
export function EmptyState({ title, description }: StatusStateProps) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </section>
  );
}

// 顯示 API 或權限錯誤的共用狀態，後續可依 error.code 放入穩定訊息。
export function ErrorState({ title, description }: StatusStateProps) {
  return (
    <section className="card" role="alert">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </section>
  );
}
