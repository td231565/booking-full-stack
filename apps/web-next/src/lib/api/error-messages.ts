import { ApiClientError } from './client';

// 將 API 錯誤碼轉為穩定 UI 訊息，供表單與頁面共用。
export function getApiErrorMessage(error: unknown, fallback = '系統暫時無法處理請求。'): string {
  if (!(error instanceof ApiClientError)) {
    return fallback;
  }

  if (error.code === 'RATE_LIMITED') {
    return '操作太頻繁，請稍後再試。';
  }

  return error.message;
}

// 後台頁面專用錯誤訊息，非 admin 時顯示明確權限提示。
export function getAdminErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'FORBIDDEN') {
    return '你沒有後台管理權限。';
  }

  return getApiErrorMessage(error, '請稍後再試。');
}
