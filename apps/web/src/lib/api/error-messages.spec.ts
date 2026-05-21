import { ApiClientError } from './client';
import { getApiErrorMessage } from './error-messages';

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
