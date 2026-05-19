import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type PublicUserRecord = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
};

export type UserWithPasswordRecord = PublicUserRecord & {
  passwordHash: string;
};

@Injectable()
export class AuthRepository {
  // 注入 DataSource 以封裝 users 與 sessions 的原生 SQL 操作。
  constructor(private readonly dataSource: DataSource) {}

  // 建立一般會員帳號，註冊流程固定 role=user、status=active。
  async createUser(email: string, passwordHash: string, displayName: string): Promise<PublicUserRecord> {
    const rows = await this.dataSource.query<PublicUserRecord[]>(
      `
        INSERT INTO users (email, password_hash, display_name, role, status)
        VALUES ($1, $2, $3, 'user', 'active')
        RETURNING id, email, display_name AS "displayName", role, status
      `,
      [email, passwordHash, displayName],
    );

    return rows[0];
  }

  // 依 email 取得登入驗證需要的密碼雜湊，查詢時統一用 lower(email) 比對。
  async findUserWithPasswordByEmail(email: string): Promise<UserWithPasswordRecord | null> {
    const rows = await this.dataSource.query<UserWithPasswordRecord[]>(
      `
        SELECT
          id,
          email,
          password_hash AS "passwordHash",
          display_name AS "displayName",
          role,
          status
        FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1
      `,
      [email],
    );

    return rows[0] ?? null;
  }

  // 建立 server-side session，資料庫只保存 token hash，不保存 cookie 明文 token。
  async createSession(userId: string, sessionTokenHash: string, expiresAt: Date): Promise<void> {
    await this.dataSource.query(
      `
        INSERT INTO sessions (user_id, session_token_hash, expires_at)
        VALUES ($1, $2, $3)
      `,
      [userId, sessionTokenHash, expiresAt],
    );
  }

  // 透過 session token hash 取得目前登入者，並排除已過期或 revoked 的 session。
  async findUserByActiveSessionHash(sessionTokenHash: string): Promise<PublicUserRecord | null> {
    const rows = await this.dataSource.query<PublicUserRecord[]>(
      `
        SELECT
          u.id,
          u.email,
          u.display_name AS "displayName",
          u.role,
          u.status
        FROM sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.session_token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
        LIMIT 1
      `,
      [sessionTokenHash],
    );

    return rows[0] ?? null;
  }

  // 登出時撤銷目前 session，避免同一 cookie token 後續仍可使用。
  async revokeSession(sessionTokenHash: string): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE sessions
        SET revoked_at = now()
        WHERE session_token_hash = $1 AND revoked_at IS NULL
      `,
      [sessionTokenHash],
    );
  }
}
