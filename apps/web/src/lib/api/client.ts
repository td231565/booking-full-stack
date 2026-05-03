export type ApiSuccessResponse<T> = {
  data: T;
};

export type ApiListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiListResponse<T> = {
  data: T[];
  meta: ApiListMeta;
};

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  // 保存 API 穩定錯誤碼與 HTTP status，讓前端可依 error.code 顯示固定 UI。
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

// 呼叫後端 API 並統一解析成功與錯誤回應格式。
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw toApiClientError(response.status, body);
  }

  return body as T;
}

// 將未知錯誤 body 收斂成 ApiClientError，避免 UI 直接依賴不穩定格式。
function toApiClientError(status: number, body: unknown): ApiClientError {
  if (hasApiErrorShape(body)) {
    return new ApiClientError(status, body.error.code, body.error.message);
  }

  return new ApiClientError(status, 'INTERNAL_ERROR', '系統暫時無法處理請求');
}

// 檢查後端回應是否符合 error.code + error.message 契約。
function hasApiErrorShape(value: unknown): value is { error: { code: string; message: string } } {
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
