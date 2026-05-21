export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
export const SESSION_COOKIE_NAME = 'booking_session';
export const DEFAULT_PASSWORD = 'password123';

// migration 種子資料中的公開服務名稱，供 E2E 對照契約行為。
export const SEED_SERVICE_NAMES = {
  active: '個人諮詢',
  inactive: '團隊諮詢',
  hidden: '內部測試服務',
} as const;
