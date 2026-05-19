import { RateLimitConfig } from './rate-limit.service';

// 註冊：每 IP 10 分鐘 5 次（api_contract §2.8）。
export const REGISTER_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  max: 5,
};

// 登入：每 IP + email 10 分鐘 5 次。
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000,
  max: 5,
};

// 建立預約：每 userId 每分鐘 5 次。
export const CREATE_BOOKING_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  max: 5,
};

// 取消預約：每 userId 每分鐘 5 次。
export const CANCEL_BOOKING_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  max: 5,
};

// Public API：每 IP 每分鐘 120 次。
export const PUBLIC_API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  max: 120,
};

// Admin API：每 admin userId 每分鐘 60 次。
export const ADMIN_API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  max: 60,
};
