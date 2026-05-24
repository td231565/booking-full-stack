import { notFound } from 'next/navigation';
import { ServiceStatusBadge } from '@/components/ui/badge';
import { ListRow, ListStack } from '@/components/ui/list-row';
import { Notice } from '@/components/ui/notice';
import { Page, Panel } from '@/components/ui/page';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { ApiClientError } from '@/lib/api/client';
import {
  getPublicAvailability,
  getPublicService,
  PublicAvailabilitySlot,
  PublicService,
} from '@/lib/services/public-services';
import { BookingActions } from './booking-actions';

type ServiceDetailPageProps = {
  params: Promise<{
    serviceId: string;
  }>;
};

// 串接公開服務詳情與可預約時段 API，訪客不用登入即可瀏覽。
export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { serviceId } = await params;

  try {
    const [serviceResponse, availabilityResponse] = await Promise.all([
      getPublicService(serviceId),
      getPublicAvailability(serviceId),
    ]);

    return (
      <Page>
        <ServiceSummary service={serviceResponse.data} />
        <AvailabilityList service={serviceResponse.data} slots={availabilityResponse.data} />
      </Page>
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'SERVICE_NOT_FOUND') {
      notFound();
    }

    return (
      <Page>
        <ErrorState title="服務詳情暫時無法載入" description={getErrorMessage(error)} />
      </Page>
    );
  }
}

// 顯示服務基本資訊，inactive 服務會明確說明目前不可預約。
function ServiceSummary({ service }: { service: PublicService }) {
  return (
    <Panel className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{service.name}</h1>
        <ServiceStatusBadge status={service.status} />
      </div>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">{service.description ?? '此服務尚未提供說明。'}</p>
      <p className="mt-3 text-sm font-medium text-ink">
        {formatDuration(service.durationMinutes)} · {formatPrice(service.price)}
      </p>
      {service.status === 'inactive' ? (
        <div className="mt-4">
          <Notice>此服務目前暫停預約，仍可查看服務內容。</Notice>
        </div>
      ) : null}
    </Panel>
  );
}

// 顯示可預約時段清單，inactive 服務不顯示預約入口。
function AvailabilityList({ service, slots }: { service: PublicService; slots: PublicAvailabilitySlot[] }) {
  if (service.status !== 'active') {
    return <EmptyState title="目前不可預約" description="此服務暫停接受新預約。" />;
  }

  if (slots.length === 0) {
    return <EmptyState title="目前沒有可預約時段" description="請稍後再回來查看。" />;
  }

  return (
    <Panel>
      <h2 className="text-lg font-semibold text-ink">可預約時段</h2>
      <ListStack>
        {slots.map((slot) => (
          <ListRow
            actions={<BookingActions serviceId={service.id} slot={slot} />}
            key={slot.id}
          >
            <p className="font-semibold text-ink">{formatDateTime(slot.startAt)}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {formatTime(slot.startAt)} - {formatTime(slot.endAt)}
            </p>
          </ListRow>
        ))}
      </ListStack>
    </Panel>
  );
}

// 格式化服務金額，讓價格以台幣整數呈現。
function formatPrice(price: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(price);
}

// 格式化服務時長，讓詳情資訊維持一致呈現。
function formatDuration(durationMinutes: number): string {
  return `${durationMinutes} 分鐘`;
}

// 格式化時段日期，使用台灣常見日期時間格式呈現。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

// 格式化同日時段時間，避免每個區間重複顯示完整日期。
function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

// 將 API 錯誤轉為頁面可讀訊息，未知錯誤使用通用提示。
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return '請稍後再試。';
}
