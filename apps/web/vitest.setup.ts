import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './test/msw/server';

// 測試期間固定 API base URL，讓 MSW handler 與 apiFetch 使用同一主機。
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3001';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
