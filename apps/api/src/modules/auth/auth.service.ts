import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import * as argon2 from 'argon2';
import { ApiException } from '../../common/api-exception';
import { AuthRepository, PublicUserRecord } from './auth.repository';

export type SessionAudience = 'member' | 'admin';

export type LoginResult = {
  user: PublicUserRecord;
  sessionToken: string;
  expiresAt: Date;
};

const SESSION_COOKIE_NAMES: Record<SessionAudience, string> = {
  member: 'booking_member_session',
  admin: 'booking_admin_session',
};
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  // 注入 AuthRepository，保留 session 與 user credential 資料存取邊界。
  constructor(private readonly authRepository: AuthRepository) {}

  // 註冊一般會員，密碼以 argon2id 雜湊後才寫入資料庫。
  async register(email: string, password: string, displayName: string): Promise<PublicUserRecord> {
    try {
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      return await this.authRepository.createUser(email.trim().toLowerCase(), passwordHash, displayName.trim());
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ApiException(409, 'EMAIL_ALREADY_USED', 'email 已被使用');
      }

      throw error;
    }
  }

  // 驗證帳密並建立 server-side session；admin audience 僅允許 role=admin。
  async login(email: string, password: string, audience: SessionAudience = 'member'): Promise<LoginResult> {
    const user = await this.authRepository.findUserWithPasswordByEmail(email.trim().toLowerCase());

    if (!user) {
      throw new ApiException(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤');
    }

    if (user.status === 'disabled') {
      throw new ApiException(403, 'USER_DISABLED', '帳號已停用');
    }

    const isValidPassword = await argon2.verify(user.passwordHash, password);

    if (!isValidPassword) {
      throw new ApiException(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤');
    }

    // 後台登入需額外檢查角色，避免一般會員取得 admin cookie。
    if (audience === 'admin' && user.role !== 'admin') {
      throw new ApiException(403, 'FORBIDDEN', '權限不足');
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await this.authRepository.createSession(user.id, this.hashSessionToken(sessionToken), expiresAt);

    return {
      user: this.toPublicUser(user),
      sessionToken,
      expiresAt,
    };
  }

  // 後台專用登入，內建 admin audience 與角色檢查。
  async loginAsAdmin(email: string, password: string): Promise<LoginResult> {
    return this.login(email, password, 'admin');
  }

  // 依 cookie token 查詢目前登入者，未登入或 session 失效時回傳 UNAUTHENTICATED。
  async getCurrentUser(
    sessionToken: string | undefined,
    _audience: SessionAudience = 'member',
  ): Promise<PublicUserRecord> {
    if (!sessionToken) {
      throw new ApiException(401, 'UNAUTHENTICATED', '尚未登入');
    }

    const user = await this.authRepository.findUserByActiveSessionHash(this.hashSessionToken(sessionToken));

    if (!user || user.status === 'disabled') {
      throw new ApiException(401, 'UNAUTHENTICATED', '尚未登入');
    }

    return user;
  }

  // 登出時撤銷目前 session；沒有 cookie 時也回成功以維持 logout 冪等。
  async logout(sessionToken: string | undefined, _audience: SessionAudience = 'member'): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await this.authRepository.revokeSession(this.hashSessionToken(sessionToken));
  }

  // 依 audience 回傳 cookie 名稱，前台與後台使用不同 HttpOnly cookie。
  getSessionCookieName(audience: SessionAudience = 'member'): string {
    return SESSION_COOKIE_NAMES[audience];
  }

  // 將 session token 雜湊成固定長度字串，避免 DB 保存可直接使用的 token。
  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }

  // 移除 passwordHash，確保 Auth API 不回傳密碼雜湊。
  private toPublicUser(user: PublicUserRecord): PublicUserRecord {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
    };
  }

  // 判斷 PostgreSQL unique constraint 錯誤，避免把重複 email 當成 500。
  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
  }
}
