import { LoadingState } from '@/components/ui/status-state';

// 顯示服務詳情載入狀態，讓服務與時段資料請求期間有穩定回饋。
export default function ServiceDetailLoading() {
  return (
    <main className="page">
      <LoadingState title="服務詳情載入中" description="正在取得服務內容與可預約時段。" />
    </main>
  );
}
