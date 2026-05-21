import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';
import { parseSessionCookie, sessionCookieHeader } from './helpers/http';

describe('Auth API (integration)', () => {
  let app: INestApplication;
  const runId = Date.now();
  const password = 'password123';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
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
});
