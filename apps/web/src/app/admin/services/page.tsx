import { cookies } from 'next/headers';
import { EmptyState, ErrorState } from '@/components/ui/status-state';
import { ApiClientError } from '@/lib/api/client';
import { AdminService, getAdminServices } from '@/lib/admin/admin-api';

export const dynamic = 'force-dynamic';

// 顯示後台服務管理列表，Admin API 可查詢 active、inactive 與 hidden 服務。
export default async function AdminServicesPage() {
  try {
    const response = await getAdminServices({ cookieHeader: (await cookies()).toString() });

    return (
      <main className="page">
        <header className="page__header">
          <h1>服務管理</h1>
          <p>後台可管理公開、停用與隱藏服務。</p>
        </header>

        {response.data.length > 0 ? (
          <div className="grid">
            {response.data.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : (
          <EmptyState title="尚未建立服務" description="可透過 Admin API 建立服務。" />
        )}
      </main>
    );
  } catch (error) {
    return (
      <main className="page">
        <ErrorState title="服務管理資料無法載入" description={getErrorMessage(error)} />
      </main>
    );
  }
}

// 顯示服務管理卡片，hidden 服務在後台仍會出現。
function ServiceCard({ service }: { service: AdminService }) {
  return (
    <article className="card">
      <h2>{service.name}</h2>
      <p>{service.description ?? '此服務尚未提供說明。'}</p>
      <p>
        {service.durationMinutes} 分鐘 · {formatPrice(service.price)}
      </p>
      <p>狀態：{formatServiceStatus(service.status)}</p>
    </article>
  );
}

// 將服務狀態轉成後台易讀文字。
function formatServiceStatus(status: AdminService['status']): string {
  const labels = {
    active: '啟用',
    inactive: '停用',
    hidden: '隱藏',
  };

  return labels[status];
}

// 格式化服務金額，讓價格以台幣整數呈現。
function formatPrice(price: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(price);
}

// 將 API 錯誤轉為頁面可讀訊息，未知錯誤使用通用提示。
function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return '請稍後再試。';
}
