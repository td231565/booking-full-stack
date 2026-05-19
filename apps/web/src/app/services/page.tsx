import Link from 'next/link';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { ApiClientError } from '@/lib/api/client';
import { getPublicServices, PublicService } from '@/lib/services/public-services';

type ServicesPageProps = {
  searchParams?: Promise<{
    page?: string;
  }>;
};

// 串接公開服務列表 API，顯示 active 與 inactive 服務並排除 hidden 服務。
export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const page = parsePositivePage((await searchParams)?.page);

  try {
    const response = await getPublicServices(page, 20);

    return (
      <main className="page">
        <header className="page__header">
          <h1>服務列表</h1>
          <p>選擇服務查看內容與可預約時段。</p>
        </header>

        {response.data.length > 0 ? (
          <div className="grid">
            {response.data.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : (
          <EmptyState title="目前沒有公開服務" description="請稍後再回來查看。" />
        )}

        <Pagination page={response.meta.page} totalPages={response.meta.totalPages} />
      </main>
    );
  } catch (error) {
    return (
      <main className="page">
        <ErrorState title="服務列表暫時無法載入" description={getErrorMessage(error)} />
      </main>
    );
  }
}

// 顯示單張公開服務卡片，inactive 服務會清楚標示不可預約。
function ServiceCard({ service }: { service: PublicService }) {
  return (
    <article className="card service-card">
      <div className="service-card__header">
        <h2>{service.name}</h2>
        <StatusBadge status={service.status} />
      </div>
      <p>{service.description ?? '此服務尚未提供說明。'}</p>
      <p>
        {formatDuration(service.durationMinutes)} · {formatPrice(service.price)}
      </p>
      <Link className="button-link" href={`/services/${service.id}`}>
        查看詳情
      </Link>
    </article>
  );
}

// 顯示服務狀態標籤，讓 inactive 服務不會被誤認為可預約。
function StatusBadge({ status }: { status: PublicService['status'] }) {
  return <span className={`badge badge--${status}`}>{status === 'active' ? '可預約' : '暫停預約'}</span>;
}

// 顯示基本分頁入口，避免列表資料超過一頁時無法瀏覽。
function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="pagination" aria-label="服務列表分頁">
      {page > 1 ? <Link href={`/services?page=${page - 1}`}>上一頁</Link> : <span>上一頁</span>}
      <span>
        第 {page} / {totalPages} 頁
      </span>
      {page < totalPages ? <Link href={`/services?page=${page + 1}`}>下一頁</Link> : <span>下一頁</span>}
    </nav>
  );
}

// 解析 query string 頁碼，無效值回到第一頁。
function parsePositivePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? '1', 10);

  return Number.isFinite(page) && page > 0 ? page : 1;
}

// 格式化服務金額，讓價格以台幣整數呈現。
function formatPrice(price: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(price);
}

// 格式化服務時長，讓列表卡片維持簡潔可讀。
function formatDuration(durationMinutes: number): string {
  return `${durationMinutes} 分鐘`;
}

// 將 API 錯誤轉為頁面可讀訊息，未知錯誤使用通用提示。
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return '請稍後再試。';
}
