import { cookies } from 'next/headers';
import { AdminServiceStatusBadge } from '@/components/ui/badge';
import { Page, PageHeader, Panel } from '@/components/ui/page';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { getAdminErrorMessage } from '@/lib/api/error-messages';
import { AdminService, getAdminServices } from '@/lib/admin/admin-api';

export const dynamic = 'force-dynamic';

// 顯示後台服務管理列表，Admin API 可查詢 active、inactive 與 hidden 服務。
export default async function AdminServicesPage() {
  try {
    const response = await getAdminServices({ cookieHeader: (await cookies()).toString() });

    return (
      <Page>
        <PageHeader description="後台可管理公開、停用與隱藏服務。" title="服務管理" />

        {response.data.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {response.data.map((service) => (
              <li key={service.id}>
                <ServiceCard service={service} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="尚未建立服務" description="可透過 Admin API 建立服務。" />
        )}
      </Page>
    );
  } catch (error) {
    return (
      <Page>
        <ErrorState title="服務管理資料無法載入" description={getAdminErrorMessage(error)} />
      </Page>
    );
  }
}

// 顯示服務管理卡片，hidden 服務在後台仍會出現。
function ServiceCard({ service }: { service: AdminService }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{service.name}</h2>
        <AdminServiceStatusBadge status={service.status} />
      </div>
      <p className="mt-3 text-sm text-ink-muted">{service.description ?? '此服務尚未提供說明。'}</p>
      <p className="mt-2 text-sm font-medium text-ink">
        {service.durationMinutes} 分鐘 · {formatPrice(service.price)}
      </p>
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
