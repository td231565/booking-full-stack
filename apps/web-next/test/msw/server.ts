import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// 在 Node 測試環境啟動 MSW server，攔截 apiFetch 發出的 HTTP 請求。
export const server = setupServer(...handlers);
