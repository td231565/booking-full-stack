import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import {
  expectSessionCookieCleared,
  expectSessionCookieSecurityAttributes,
  parseSessionCookie,
  sessionCookieHeader,
} from './helpers/http';
import { closeTestDataSource, disableUser } from './helpers/test-db';

describe('Auth API (integration)', () => {
  let app: INestApplication;
  const runId = Date.now();
  const password = 'password123';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDataSource();
  });

  // POST /api/auth/register 成功建立會員。
  it('POST /api/auth/register 成功建立會員', async () => {
    const email = `auth-register-${runId}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.10.1.${runId % 200}`)
      .send({ email, password, displayName: 'Auth Register' })
      .expect(201);

    expect(response.body.data).toMatchObject({
      email,
      displayName: 'Auth Register',
      role: 'user',
      status: 'active',
    });
    expect(response.body.data).not.toHaveProperty('passwordHash');
  });

  // POST /api/auth/login 成功並回傳 booking_session cookie。
  it('POST /api/auth/login 成功取得 booking_session cookie', async () => {
    const email = `auth-login-${runId}@example.com`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.10.2.${runId % 200}`)
      .send({ email, password, displayName: 'Auth Login' });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.10.2.${runId % 200}`)
      .send({ email, password })
      .expect(200);

    expect(parseSessionCookie(response)).toBeTruthy();
    expect(response.body.data.email).toBe(email);
  });

  // GET /api/auth/me 使用 cookie 回傳目前登入者。
  it('GET /api/auth/me 使用 cookie 回傳目前登入者', async () => {
    const email = `auth-me-${runId}@example.com`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.10.3.${runId % 200}`)
      .send({ email, password, displayName: 'Auth Me' });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.10.3.${runId % 200}`)
      .send({ email, password });

    const sessionToken = parseSessionCookie(login);
    expect(sessionToken).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sessionCookieHeader(sessionToken!))
      .expect(200);

    expect(me.body.data.email).toBe(email);
  });

  // POST /api/auth/logout 清除 session，後續 /me 回 401。
  it('POST /api/auth/logout 清除 session 後 /me 回 401', async () => {
    const email = `auth-logout-${runId}@example.com`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.10.4.${runId % 200}`)
      .send({ email, password, displayName: 'Auth Logout' });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.10.4.${runId % 200}`)
      .send({ email, password });

    const sessionToken = parseSessionCookie(login);
    expect(sessionToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', sessionCookieHeader(sessionToken!))
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', sessionCookieHeader(sessionToken!))
      .expect(401);

    expect(me.body.error.code).toBe('UNAUTHENTICATED');
  });

  describe('Auth 反向與邊界', () => {
    // 重複 email 註冊應回 409 EMAIL_ALREADY_USED。
    it('POST /api/auth/register 重複 email 回 409 EMAIL_ALREADY_USED', async () => {
      const email = `auth-dup-${runId}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', `10.10.5.${runId % 200}`)
        .send({ email, password, displayName: 'Dup First' })
        .expect(201);

      const duplicate = await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', `10.10.5.${runId % 200}`)
        .send({ email, password, displayName: 'Dup Second' })
        .expect(409);

      expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_USED');
    });

    // 帳號不存在時 login 回 INVALID_CREDENTIALS，避免帳號枚舉。
    it('POST /api/auth/login 帳號不存在回 INVALID_CREDENTIALS', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.10.6.${runId % 200}`)
        .send({ email: `auth-missing-${runId}@example.com`, password })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    // 密碼錯誤時 login 同樣回 INVALID_CREDENTIALS。
    it('POST /api/auth/login 密碼錯誤回 INVALID_CREDENTIALS', async () => {
      const email = `auth-wrong-pw-${runId}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', `10.10.7.${runId % 200}`)
        .send({ email, password, displayName: 'Wrong PW' });

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.10.7.${runId % 200}`)
        .send({ email, password: 'wrong-password' })
        .expect(401);

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    // 停用帳號不可登入，回 USER_DISABLED。
    it('POST /api/auth/login 停用帳號回 USER_DISABLED', async () => {
      const email = `auth-disabled-${runId}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', `10.10.8.${runId % 200}`)
        .send({ email, password, displayName: 'Disabled User' });

      await disableUser(email);

      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.10.8.${runId % 200}`)
        .send({ email, password })
        .expect(403);

      expect(response.body.error.code).toBe('USER_DISABLED');
    });

    // 未帶 cookie 呼叫 /me 應回 401 UNAUTHENTICATED。
    it('GET /api/auth/me 無 cookie 回 401 UNAUTHENTICATED', async () => {
      const response = await request(app.getHttpServer()).get('/api/auth/me').expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('Auth Cookie 安全屬性', () => {
    // login 回應的 Set-Cookie 應含 HttpOnly 與 SameSite=Lax。
    it('POST /api/auth/login Set-Cookie 含 HttpOnly 與 SameSite=Lax', async () => {
      const email = `auth-cookie-attrs-${runId}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', `10.10.9.${runId % 200}`)
        .send({ email, password, displayName: 'Cookie Attrs' });

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.10.9.${runId % 200}`)
        .send({ email, password })
        .expect(200);

      expectSessionCookieSecurityAttributes(login);
    });

    // logout 回應應透過 Set-Cookie 清除 session。
    it('POST /api/auth/logout Set-Cookie 清除 session', async () => {
      const email = `auth-cookie-clear-${runId}@example.com`;

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', `10.10.10.${runId % 200}`)
        .send({ email, password, displayName: 'Cookie Clear' });

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.10.10.${runId % 200}`)
        .send({ email, password });

      const sessionToken = parseSessionCookie(login);
      expect(sessionToken).toBeTruthy();

      const logout = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', sessionCookieHeader(sessionToken!))
        .expect(200);

      expectSessionCookieCleared(logout);
    });
  });
});
