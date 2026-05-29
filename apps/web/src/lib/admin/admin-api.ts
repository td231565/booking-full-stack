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

// 依日期範圍取得預約列表，供 Server Component (帶 cookie) 或 Client Component 使用。
export async function getAdminBookingsByDateRange(
  from: string,
  to: string,
  options?: AdminFetchOptions,
): Promise<ApiListResponse<AdminBooking>> {
  const params = new URLSearchParams({
    from,
    to,
    page: '1',
    pageSize: '100', // 日曆視圖通常一次抓一個月，給較大 pageSize
  });
  return apiFetch<ApiListResponse<AdminBooking>>(`/api/admin/bookings?${params.toString()}`, {
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

// Admin 替會員建立預約（Client Component 用，不帶 cookieHeader）。
export async function createAdminBooking(input: {
  userId: string;
  availabilitySlotId: string;
  note?: string;
}): Promise<ApiSuccessResponse<AdminBooking>> {
  return apiFetch<ApiSuccessResponse<AdminBooking>>('/api/admin/bookings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Admin 更新預約備註或改期。
export async function updateAdminBooking(
  bookingId: string,
  input: { note?: string; availabilitySlotId?: string },
): Promise<ApiSuccessResponse<AdminBooking>> {
  return apiFetch<ApiSuccessResponse<AdminBooking>>(`/api/admin/bookings/${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// Admin 取消預約。
export async function cancelAdminBooking(
  bookingId: string,
  input?: { reason?: string },
): Promise<ApiSuccessResponse<AdminBooking>> {
  return apiFetch<ApiSuccessResponse<AdminBooking>>(`/api/admin/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(input || {}),
  });
}

// 依 email 查詢 active 會員，供新增預約 dialog 使用。
export async function lookupAdminUserByEmail(email: string): Promise<
  ApiSuccessResponse<{
    id: string;
    email: string;
    displayName: string;
  }>
> {
  const params = new URLSearchParams({ email });
  return apiFetch<
    ApiSuccessResponse<{
      id: string;
      email: string;
      displayName: string;
    }>
  >(`/api/admin/users/lookup?${params.toString()}`, {
    cache: 'no-store',
  });
}

// 查詢指定服務的 available 時段，供改期與新增預約選擇。
export async function getAdminAvailableSlots(serviceId: string): Promise<ApiListResponse<AdminAvailabilitySlot>> {
  const params = new URLSearchParams({
    serviceId,
    status: 'available',
    page: '1',
    pageSize: '50',
  });
  return apiFetch<ApiListResponse<AdminAvailabilitySlot>>(`/api/admin/availability-slots?${params.toString()}`, {
    cache: 'no-store',
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
