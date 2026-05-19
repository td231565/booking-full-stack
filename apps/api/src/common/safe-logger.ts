const SENSITIVE_KEY_PATTERN = /password|token|cookie|authorization|secret/i;

// 將錯誤物件轉成可安全寫入 log 的純物件，避免洩漏密碼或 token。
export function toSafeLogPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toSafeLogPayload(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
      continue;
    }

    result[key] = toSafeLogPayload(nested);
  }

  return result;
}

// 輸出結構化錯誤 log，包含 request id 與錯誤碼。
export function logApiError(payload: {
  requestId?: string;
  code: string;
  message: string;
  status: number;
  path?: string;
  detail?: unknown;
}): void {
  console.error(
    JSON.stringify({
      level: 'error',
      requestId: payload.requestId ?? 'unknown',
      code: payload.code,
      message: payload.message,
      status: payload.status,
      path: payload.path,
      detail: payload.detail ? toSafeLogPayload(payload.detail) : undefined,
    }),
  );
}
