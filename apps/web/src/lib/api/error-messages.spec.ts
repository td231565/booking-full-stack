import { ApiClientError } from './client';
import { getApiErrorMessage, getAdminErrorMessage } from './error-messages';

describe('getApiErrorMessage', () => {
  // RATE_LIMITED 有專用文案，不依賴後端 message 字串。
  it('已知 RATE_LIMITED code 回對應訊息', () => {
    const error = new ApiClientError(429, 'RATE_LIMITED', 'too many requests');

    expect(getApiErrorMessage(error)).toBe('操作太頻繁，請稍後再試。');
  });

  // 其他 ApiClientError 直接顯示後端提供的 message。
  it('已知一般 ApiClientError code 回 API message', () => {
    const error = new ApiClientError(409, 'EMAIL_ALREADY_USED', 'email 已被使用');

    expect(getApiErrorMessage(error)).toBe('email 已被使用');
  });

  // 非 ApiClientError（含未知例外）回 fallback，避免 UI 顯示 undefined。
  it('未知錯誤回 fallback', () => {
    expect(getApiErrorMessage(new Error('unexpected'))).toBe('系統暫時無法處理請求。');
    expect(getApiErrorMessage('plain string', '自訂 fallback')).toBe('自訂 fallback');
  });
});

describe('getAdminErrorMessage', () => {
  // FORBIDDEN 顯示明確的後台權限提示，與一般錯誤訊息區分。
  it('FORBIDDEN 回後台權限提示', () => {
    const error = new ApiClientError(403, 'FORBIDDEN', '無權限');

    expect(getAdminErrorMessage(error)).toBe('你沒有後台管理權限。');
  });

  // FORBIDDEN 以外的 ApiClientError 走 getApiErrorMessage 路徑，RATE_LIMITED 有專用文案。
  it('RATE_LIMITED 回操作太頻繁訊息', () => {
    const error = new ApiClientError(429, 'RATE_LIMITED', 'too many requests');

    expect(getAdminErrorMessage(error)).toBe('操作太頻繁，請稍後再試。');
  });

  // 非 ApiClientError fallback 與一般 fallback 文案不同，後台頁用較短的「請稍後再試。」。
  it('非 ApiClientError 回後台專用 fallback', () => {
    expect(getAdminErrorMessage(new Error('unexpected'))).toBe('請稍後再試。');
  });
});
