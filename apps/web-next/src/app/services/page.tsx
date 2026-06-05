import Link from 'next/link';
import { ServiceStatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Page, PageHeader, Panel } from '@/components/ui/page';
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
      <Page>
        <PageHeader description="選擇服務查看內容與可預約時段。" title="服務列表" />

        {response.data.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {response.data.map((service) => (
              <li key={service.id}>
                <ServiceCard service={service} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="目前沒有公開服務" description="請稍後再回來查看。" />
        )}

        <Pagination buildHref={(p) => `/services?page=${p}`} page={response.meta.page} totalPages={response.meta.totalPages} />
      </Page>
    );
  } catch (error) {
    return (
      <Page>
        <ErrorState title="服務列表暫時無法載入" description={getErrorMessage(error)} />
      </Page>
    );
  }
}

// 顯示單張公開服務卡片，inactive 服務會清楚標示不可預約。
function ServiceCard({ service }: { service: PublicService }) {
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-ink">{service.name}</h2>
        <ServiceStatusBadge status={service.status} />
      </div>
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">{service.description ?? '此服務尚未提供說明。'}</p>
      <p className="text-sm font-medium text-ink">
        {formatDuration(service.durationMinutes)} · {formatPrice(service.price)}
      </p>
      <ButtonLink className="self-start" href={`/services/${service.id}`}>
        查看詳情
      </ButtonLink>
    </Panel>
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
