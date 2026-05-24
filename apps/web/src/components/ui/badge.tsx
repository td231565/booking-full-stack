type ServiceStatus = 'active' | 'inactive';

const serviceLabels: Record<ServiceStatus, string> = {
  active: '可預約',
  inactive: '暫停預約',
};

const serviceStyles: Record<ServiceStatus, string> = {
  active: 'bg-success-bg text-success',
  inactive: 'bg-warning-bg text-warning',
};

// 顯示服務可預約狀態，避免 inactive 被誤認為可預約。
export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${serviceStyles[status]}`}>
      {serviceLabels[status]}
    </span>
  );
}

type BookingStatus = 'confirmed' | 'cancelled' | 'completed';

// 顯示預約狀態標籤，用於列表與詳情。
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const label = status === 'cancelled' ? '已取消' : status === 'completed' ? '已完成' : '已成立';
  const style =
    status === 'cancelled'
      ? 'bg-ink/5 text-ink-muted'
      : status === 'completed'
        ? 'bg-accent-soft text-accent'
        : 'bg-success-bg text-success';

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}

type AdminServiceStatus = 'active' | 'inactive' | 'hidden';

const adminLabels: Record<AdminServiceStatus, string> = {
  active: '啟用',
  inactive: '停用',
  hidden: '隱藏',
};

// 顯示後台服務狀態，hidden 在後台仍須可辨識。
export function AdminServiceStatusBadge({ status }: { status: AdminServiceStatus }) {
  const style =
    status === 'active'
      ? 'bg-success-bg text-success'
      : status === 'inactive'
        ? 'bg-warning-bg text-warning'
        : 'bg-ink/5 text-ink-muted';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{adminLabels[status]}</span>
  );
}
