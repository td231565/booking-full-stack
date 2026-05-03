import { EmptyState } from '@/components/ui/status-state';

type ServiceDetailPageProps = {
  params: Promise<{
    serviceId: string;
  }>;
};

// 顯示服務詳情頁骨架，Phase 3 會串接服務詳情與可預約時段 API。
export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { serviceId } = await params;

  return (
    <main className="page">
      <section className="card">
        <h1>服務詳情</h1>
        <p>服務 ID：{serviceId}</p>
        <p>此頁後續會顯示服務狀態、價格、時長與可預約時段。</p>
      </section>
      <EmptyState title="尚未載入可預約時段" description="Phase 3 會串接 availability API。" />
    </main>
  );
}
