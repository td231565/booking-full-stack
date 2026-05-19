import { ApiListResponse, ApiSuccessResponse, apiFetch } from '@/lib/api/client';

export type AdminService = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  durationMinutes: number;
  price: number;
  status: 'active' | 'inactive' | 'hidden';
  createdAt: string;
  updatedAt: string;
};

export type AdminAvailabilitySlot = {
  id: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: 'available' | 'blocked' | 'inactive';
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    status: AdminService['status'];
  };
};

export type AdminBooking = {
  id: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  note: string | null;
  cancelledAt: string | null;
  cancelledBy: 'user' | 'admin' | null;
  cancelReason: string | null;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  service: {
    id: string;
    name: string;
  };
  slot: {
    id: string;
    startAt: string;
    endAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditLog = {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type AdminFetchOptions = {
  cookieHeader?: string;
};

// 取得後台服務列表，後台資料固定 no-store 避免跨使用者快取。
export async function getAdminServices(options?: AdminFetchOptions): Promise<ApiListResponse<AdminService>> {
  return apiFetch<ApiListResponse<AdminService>>('/api/admin/services?page=1&pageSize=50', {
    cache: 'no-store',
    headers: toCookieHeader(options),
  });
}

// 取得後台時段列表，顯示最近一批可管理時段。
export async function getAdminAvailabilitySlots(options?: AdminFetchOptions): Promise<ApiListResponse<AdminAvailabilitySlot>> {
  return apiFetch<ApiListResponse<AdminAvailabilitySlot>>('/api/admin/availability-slots?page=1&pageSize=50', {
    cache: 'no-store',
    headers: toCookieHeader(options),
  });
}

// 取得後台預約列表，Admin 可查看所有會員預約。
export async function getAdminBookings(options?: AdminFetchOptions): Promise<ApiListResponse<AdminBooking>> {
  return apiFetch<ApiListResponse<AdminBooking>>('/api/admin/bookings?page=1&pageSize=50', {
    cache: 'no-store',
    headers: toCookieHeader(options),
  });
}

// 取得稽核紀錄列表，查詢本身不應寫入 audit log。
export async function getAdminAuditLogs(options?: AdminFetchOptions): Promise<ApiListResponse<AdminAuditLog>> {
  return apiFetch<ApiListResponse<AdminAuditLog>>('/api/admin/audit-logs?page=1&pageSize=50', {
    cache: 'no-store',
    headers: toCookieHeader(options),
  });
}

// 建立後台服務，供後續表單 action 或手動測試重用。
export async function createAdminService(input: {
  name: string;
  description?: string;
  imageUrl?: string;
  durationMinutes: number;
  price: number;
  status: AdminService['status'];
}): Promise<ApiSuccessResponse<AdminService>> {
  return apiFetch<ApiSuccessResponse<AdminService>>('/api/admin/services', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Server Component 呼叫 API 時需轉送 Cookie，讓後端能驗證 HttpOnly session。
function toCookieHeader(options: AdminFetchOptions | undefined): HeadersInit | undefined {
  return options?.cookieHeader
    ? {
        Cookie: options.cookieHeader,
      }
    : undefined;
}
