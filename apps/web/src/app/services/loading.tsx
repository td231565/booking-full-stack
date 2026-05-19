import { LoadingState } from '@/components/ui/status-state';

// 顯示服務列表載入狀態，讓公開頁資料請求期間有穩定回饋。
export default function ServicesLoading() {
  return (
    <main className="page">
      <LoadingState title="服務列表載入中" description="正在取得公開服務資料。" />
    </main>
  );
}
