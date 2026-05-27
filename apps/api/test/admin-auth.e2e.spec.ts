import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import {
  expectSessionCookieCleared,
  expectSessionCookieSecurityAttributes,
  getSetCookieHeaders,
  parseSessionCookie,
  sessionCookieHeader,
} from './helpers/http';
import { closeTestDataSource, promoteUserToAdmin } from './helpers/test-db';

describe('Admin Auth API (integration)', () => {
  let app: INestApplication;
  const runId = Date.now();
  const password = 'password123';
  let ipCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDataSource();
  });

  // 註冊一般會員並回傳 member session。
  async function registerMember(email: string, displayName: string) {
    ipCounter += 1;
    const ip = `10.40.${ipCounter}.1`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email, password, displayName });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password })
      .expect(200);

    const memberToken = parseSessionCookie(login, 'member');

    if (!memberToken) {
      throw new Error(`missing member session cookie for ${email}`);
    }

    return { email, memberToken, userId: login.body.data.id as string, ip };
  }

  // 後台登入 supertest 鏈，供 .expect() 鏈式斷言。
  function loginAdmin(email: string, ip: string) {
    return request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });
  }

  // AUTH-A-01：admin 帳號後台登入僅設定 booking_admin_session。
  it('POST /api/admin/auth/login 僅 Set-Cookie booking_admin_session', async () => {
    const email = `admin-auth-login-${runId}@example.com`;
    await registerMember(email, 'Admin Auth Login');
    await promoteUserToAdmin(email);

    const response = await loginAdmin(email, `10.40.100.${runId % 200}`).expect(200);

    expect(parseSessionCookie(response, 'admin')).toBeTruthy();
    expect(parseSessionCookie(response, 'member')).toBeNull();
    expect(
      getSetCookieHeaders(response).some((item) => item.startsWith('booking_member_session=')),
    ).toBe(false);
    expect(response.body.data.role).toBe('admin');
  });

  // AUTH-A-02：帶 admin cookie 可取得目前後台登入者。
  it('GET /api/admin/auth/me 使用 admin cookie 回傳 role=admin', async () => {
    const email = `admin-auth-me-${runId}@example.com`;
    const { ip } = await registerMember(email, 'Admin Auth Me');
    await promoteUserToAdmin(email);

    const login = await loginAdmin(email, ip).expect(200);
    const adminToken = parseSessionCookie(login, 'admin');
    expect(adminToken).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(200);

    expect(me.body.data.email).toBe(email);
    expect(me.body.data.role).toBe('admin');
  });

  // AUTH-A-03：一般會員後台登入回 403，且不得設定 admin cookie。
  it('POST /api/admin/auth/login 一般會員回 403 且不 Set admin cookie', async () => {
    const email = `admin-auth-forbidden-${runId}@example.com`;
    await registerMember(email, 'Admin Auth Forbidden');

    const response = await loginAdmin(email, `10.40.101.${runId % 200}`).expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(parseSessionCookie(response, 'admin')).toBeNull();
    expect(getSetCookieHeaders(response).some((item) => item.startsWith('booking_admin_session='))).toBe(
      false,
    );
  });

  // AUTH-A-04：後台登出僅清除 admin cookie。
  it('POST /api/admin/auth/logout 清除 admin session 後 admin /me 回 401', async () => {
    const email = `admin-auth-logout-${runId}@example.com`;
    const { ip } = await registerMember(email, 'Admin Auth Logout');
    await promoteUserToAdmin(email);

    const login = await loginAdmin(email, ip).expect(200);
    const adminToken = parseSessionCookie(login, 'admin');
    expect(adminToken).toBeTruthy();

    const logout = await request(app.getHttpServer())
      .post('/api/admin/auth/logout')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(200);

    expectSessionCookieCleared(logout, 'admin');

    const me = await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(401);

    expect(me.body.error.code).toBe('UNAUTHENTICATED');
  });

  // AUTH-A-05：僅 member cookie 呼叫 Admin API 回 401。
  it('GET /api/admin/services 僅 member cookie 回 401 UNAUTHENTICATED', async () => {
    const email = `admin-auth-member-only-${runId}@example.com`;
    const { memberToken } = await registerMember(email, 'Admin API Member Cookie');

    const response = await request(app.getHttpServer())
      .get('/api/admin/services')
      .set('Cookie', sessionCookieHeader(memberToken, 'member'))
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  // AUTH-A-06：僅 admin cookie 可存取 Admin API。
  it('GET /api/admin/services 僅 admin cookie 回 200', async () => {
    const email = `admin-auth-admin-api-${runId}@example.com`;
    const { ip } = await registerMember(email, 'Admin API Admin Cookie');
    await promoteUserToAdmin(email);

    const login = await loginAdmin(email, ip).expect(200);
    const adminToken = parseSessionCookie(login, 'admin');
    expect(adminToken).toBeTruthy();

    await request(app.getHttpServer())
      .get('/api/admin/services')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(200);
  });

  // AUTH-A-07：同一使用者可同時持有 member 與 admin session。
  it('同一使用者 member 與 admin 登入後兩條 /me 皆 200', async () => {
    const email = `admin-auth-dual-${runId}@example.com`;
    const { memberToken, ip } = await registerMember(email, 'Dual Session');
    await promoteUserToAdmin(email);

    const adminLogin = await loginAdmin(email, ip).expect(200);
    const adminToken = parseSessionCookie(adminLogin, 'admin');
    expect(adminToken).toBeTruthy();

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sessionCookieHeader(memberToken, 'member'))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(200);
  });

  // AUTH-A-08：admin 登出不影響 member session。
  it('admin logout 後 member /me 仍 200、admin /me 401', async () => {
    const email = `admin-auth-admin-logout-${runId}@example.com`;
    const { memberToken, ip } = await registerMember(email, 'Admin Logout Isolation');
    await promoteUserToAdmin(email);

    const adminLogin = await loginAdmin(email, ip).expect(200);
    const adminToken = parseSessionCookie(adminLogin, 'admin');
    expect(adminToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/admin/auth/logout')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sessionCookieHeader(memberToken, 'member'))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(401);
  });

  // AUTH-A-09：member 登出不影響 admin session。
  it('member logout 後 admin /me 仍 200、member /me 401', async () => {
    const email = `admin-auth-member-logout-${runId}@example.com`;
    const { memberToken, ip } = await registerMember(email, 'Member Logout Isolation');
    await promoteUserToAdmin(email);

    const adminLogin = await loginAdmin(email, ip).expect(200);
    const adminToken = parseSessionCookie(adminLogin, 'admin');
    expect(adminToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', sessionCookieHeader(memberToken, 'member'))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Cookie', sessionCookieHeader(adminToken!, 'admin'))
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sessionCookieHeader(memberToken, 'member'))
      .expect(401);
  });

  describe('Admin Auth Cookie 安全屬性', () => {
    // 後台 login Set-Cookie 應含 HttpOnly 與 SameSite=Lax。
    it('POST /api/admin/auth/login Set-Cookie 含 HttpOnly 與 SameSite=Lax', async () => {
      const email = `admin-auth-cookie-attrs-${runId}@example.com`;
      const { ip } = await registerMember(email, 'Admin Cookie Attrs');
      await promoteUserToAdmin(email);

      const login = await loginAdmin(email, ip).expect(200);

      expectSessionCookieSecurityAttributes(login, 'admin');
    });
  });
});
