import { ApiClientError, ApiListResponse, ApiSuccessResponse } from '@/lib/api/client';

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  durationMinutes: number;
  price: number;
  status: 'active' | 'inactive';
};

export type PublicAvailabilitySlot = {
  id: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: 'available';
};

type PublicApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

// 取得公開服務列表，不帶 cookie 以避免公開頁混入會員 session 相關資料。
export async function getPublicServices(page: number, pageSize: number): Promise<ApiListResponse<PublicService>> {
  return publicApiFetch<ApiListResponse<PublicService>>(`/api/services?page=${page}&pageSize=${pageSize}`);
}

// 取得公開服務詳情，hidden 服務會由後端回傳 SERVICE_NOT_FOUND。
export async function getPublicService(serviceId: string): Promise<ApiSuccessResponse<PublicService>> {
  return publicApiFetch<ApiSuccessResponse<PublicService>>(`/api/services/${serviceId}`);
}

// 取得公開可預約時段，預設由後端套用查詢區間與 1 小時後規則。
export async function getPublicAvailability(serviceId: string): Promise<ApiSuccessResponse<PublicAvailabilitySlot[]>> {
  return publicApiFetch<ApiSuccessResponse<PublicAvailabilitySlot[]>>(`/api/services/${serviceId}/availability`);
}

// 呼叫公開 API 並明確停用 credentials，讓公開頁快取不依賴使用者 cookie。
async function publicApiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001'}${path}`, {
    credentials: 'omit',
    next: {
      revalidate: 60,
    },
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw toApiClientError(response.status, body);
  }

  return body as T;
}

// 將公開 API 錯誤轉為前端共用錯誤型別，頁面可依 code 決定呈現方式。
function toApiClientError(status: number, body: unknown): ApiClientError {
  if (hasPublicApiErrorShape(body)) {
    return new ApiClientError(status, body.error.code, body.error.message);
  }

  return new ApiClientError(status, 'INTERNAL_ERROR', '系統暫時無法處理請求');
}

// 檢查後端錯誤是否符合 error.code + error.message 契約。
function hasPublicApiErrorShape(value: unknown): value is PublicApiErrorBody {
  if (!value || typeof value !== 'object' || !('error' in value)) {
    return false;
  }

  const error = (value as { error: unknown }).error;

  return (
    Boolean(error) &&
    typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
