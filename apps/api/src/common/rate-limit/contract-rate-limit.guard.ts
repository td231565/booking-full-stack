import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { ApiException } from '../api-exception';
import { AuthService } from '../../modules/auth/auth.service';
import {
  ADMIN_API_RATE_LIMIT,
  CANCEL_BOOKING_RATE_LIMIT,
  CREATE_BOOKING_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  PUBLIC_API_RATE_LIMIT,
  REGISTER_RATE_LIMIT,
} from './rate-limit.constants';
import { RateLimitConfig, RateLimitService } from './rate-limit.service';

type ResolvedRateLimit = {
  key: string;
  config: RateLimitConfig;
};

@Injectable()
export class ContractRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly authService: AuthService,
  ) {}

  // 依路由套用 api_contract §2.8 的 rate limit，在 handler 前阻擋過量請求。
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const resolved = await this.resolveRateLimit(request);

    if (!resolved) {
      return true;
    }

    if (!this.rateLimitService.tryConsume(resolved.key, resolved.config)) {
      throw new ApiException(429, 'RATE_LIMITED', '請求過於頻繁');
    }

    return true;
  }

  // 依 HTTP method 與路徑決定 rate limit 規則與計數 key。
  private async resolveRateLimit(request: Request): Promise<ResolvedRateLimit | null> {
    const path = this.normalizePath(request);
    const method = request.method.toUpperCase();

    if (path.startsWith('/api/health')) {
      return null;
    }

    if (method === 'POST' && path === '/api/auth/register') {
      return {
        key: `register:${this.getClientIp(request)}`,
        config: REGISTER_RATE_LIMIT,
      };
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const email = this.readEmailFromBody(request);
      return {
        key: `login:${this.getClientIp(request)}:${email ?? 'unknown'}`,
        config: LOGIN_RATE_LIMIT,
      };
    }

    if (method === 'POST' && path === '/api/bookings') {
      const userKey = await this.resolveUserKey(request);
      return {
        key: `booking-create:${userKey}`,
        config: CREATE_BOOKING_RATE_LIMIT,
      };
    }

    if (method === 'POST' && /^\/api\/me\/bookings\/[^/]+\/cancel$/.test(path)) {
      const userKey = await this.resolveUserKey(request);
      return {
        key: `booking-cancel:${userKey}`,
        config: CANCEL_BOOKING_RATE_LIMIT,
      };
    }

    if (path.startsWith('/api/admin')) {
      const adminKey = await this.resolveAdminKey(request);
      return {
        key: `admin:${adminKey}`,
        config: ADMIN_API_RATE_LIMIT,
      };
    }

    if (this.isPublicApiPath(path, method)) {
      return {
        key: `public:${this.getClientIp(request)}`,
        config: PUBLIC_API_RATE_LIMIT,
      };
    }

    return null;
  }

  // 判斷是否為 Public 服務瀏覽 API。
  private isPublicApiPath(path: string, method: string): boolean {
    if (method !== 'GET') {
      return false;
    }

    if (path === '/api/services') {
      return true;
    }

    if (/^\/api\/services\/[^/]+$/.test(path)) {
      return true;
    }

    if (/^\/api\/services\/[^/]+\/availability$/.test(path)) {
      return true;
    }

    return false;
  }

  // 取得目前登入者 id，未登入時退回 IP 避免無 key 可限流。
  private async resolveUserKey(request: Request): Promise<string> {
    const user = await this.tryGetCurrentUser(request);
    return user?.id ?? `ip:${this.getClientIp(request)}`;
  }

  // Admin API 以 admin userId 計數，非 admin 或未登入則用 IP。
  private async resolveAdminKey(request: Request): Promise<string> {
    const user = await this.tryGetCurrentUser(request);

    if (user?.role === 'admin') {
      return user.id;
    }

    return `ip:${this.getClientIp(request)}`;
  }

  // 嘗試解析 session，失敗時回 null 不拋錯，讓 rate limit 仍可運作。
  private async tryGetCurrentUser(request: Request) {
    const token = this.readSessionToken(request);

    if (!token) {
      return null;
    }

    try {
      return await this.authService.getCurrentUser(token);
    } catch {
      return null;
    }
  }

  // 從 body 讀取 email，供登入 rate limit 使用 IP + email 作為 key。
  private readEmailFromBody(request: Request): string | undefined {
    const body = request.body;

    if (!body || typeof body !== 'object' || !('email' in body)) {
      return undefined;
    }

    const email = (body as { email?: unknown }).email;

    if (typeof email !== 'string') {
      return undefined;
    }

    return email.trim().toLowerCase();
  }

  // 從 Cookie 解析 session token。
  private readSessionToken(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return undefined;
    }

    const cookieName = `${this.authService.getSessionCookieName()}=`;
    const cookie = cookieHeader
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(cookieName));

    return cookie ? decodeURIComponent(cookie.slice(cookieName.length)) : undefined;
  }

  // 正規化路徑，移除 query string 以便比對路由規則。
  private normalizePath(request: Request): string {
    const rawPath = request.originalUrl.split('?')[0];
    return rawPath.endsWith('/') && rawPath.length > 1 ? rawPath.slice(0, -1) : rawPath;
  }

  // 取得客戶端 IP，優先使用 reverse proxy 轉發的 header。
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];

    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
