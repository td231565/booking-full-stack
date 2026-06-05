import { Page } from '@/components/ui/page';
import { LoadingState } from '@/components/ui/status-state';

// 顯示服務詳情載入狀態，讓公開頁資料請求期間有穩定回饋。
export default function ServiceDetailLoading() {
  return (
    <Page>
      <LoadingState title="服務詳情載入中" description="正在取得服務與可預約時段。" />
    </Page>
  );
}
