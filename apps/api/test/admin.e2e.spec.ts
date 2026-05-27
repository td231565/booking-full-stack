import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestDataSource, hasAuditLog, promoteUserToAdmin, queryScalar } from './helpers/test-db';
import { createTestApp } from './helpers/create-test-app';
import { parseSessionCookie, sessionCookieHeader } from './helpers/http';

type AuthSession = {
  token: string;
  userId: string;
  email: string;
};

describe('Admin API (integration)', () => {
  let app: INestApplication;
  const runId = Date.now();
  const password = 'password123';
  let registerIpCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDataSource();
  });

  // 註冊並登入，回傳 session 供 Admin API 測試使用；每案例使用不同 IP 避免 register rate limit。
  async function registerAndLogin(email: string, displayName: string): Promise<AuthSession> {
    registerIpCounter += 1;
    const forwardedOctet = registerIpCounter;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.30.${forwardedOctet}.1`)
      .send({ email, password, displayName });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.30.${forwardedOctet}.1`)
      .send({ email, password })
      .expect(200);

    const token = parseSessionCookie(login);

    if (!token) {
      throw new Error(`missing session cookie for ${email}`);
    }

    return {
      token,
      userId: login.body.data.id,
      email,
    };
  }

  // 後台登入取得 admin cookie，須在 promoteUserToAdmin 之後呼叫。
  async function loginAdminSession(email: string, forwardedOctet: number): Promise<string> {
    const login = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .set('X-Forwarded-For', `10.30.${forwardedOctet}.1`)
      .send({ email, password })
      .expect(200);

    const token = parseSessionCookie(login, 'admin');

    if (!token) {
      throw new Error(`missing admin session cookie for ${email}`);
    }

    return token;
  }

  // 註冊、升級 admin 並以後台登入，回傳 admin session 供 Admin API 測試。
  async function registerPromoteAndAdminLogin(email: string, displayName: string): Promise<AuthSession> {
    const member = await registerAndLogin(email, displayName);
    await promoteUserToAdmin(member.email);
    const token = await loginAdminSession(member.email, registerIpCounter);

    return {
      token,
      userId: member.userId,
      email: member.email,
    };
  }

  // Admin CRUD 服務與時段，並驗證 audit log 寫入。
  it('Admin 可 CRUD 服務與時段並寫入 audit log', async () => {
    const adminEmail = `admin-crud-${runId}@example.com`;
    const admin = await registerPromoteAndAdminLogin(adminEmail, 'Admin CRUD');

    const created = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({
        name: `Admin Service ${runId}`,
        durationMinutes: 60,
        price: 1200,
        status: 'active',
      })
      .expect(201);

    const serviceId = created.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/admin/services/${serviceId}`)
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({ name: `Admin Service Updated ${runId}` })
      .expect(200);

    const start = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const slot = await request(app.getHttpServer())
      .post('/api/admin/availability-slots')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({
        serviceId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'available',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/admin/availability-slots/${slot.body.data.id}`)
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({ status: 'blocked' })
      .expect(200);

    expect(await hasAuditLog('admin.service.create')).toBe(true);
    expect(await hasAuditLog('admin.service.update')).toBe(true);
    expect(await hasAuditLog('admin.availability_slot.create')).toBe(true);
    expect(await hasAuditLog('admin.availability_slot.update')).toBe(true);
  });

  // 批次產生時段第二次應跳過重複（skipped >= 1）。
  it('POST /api/admin/availability-slots/bulk-generate 會跳過重複時段', async () => {
    const adminEmail = `admin-bulk-${runId}@example.com`;
    const admin = await registerPromoteAndAdminLogin(adminEmail, 'Admin Bulk');

    const service = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({
        name: `Bulk Service ${runId}`,
        durationMinutes: 60,
        price: 800,
        status: 'active',
      })
      .expect(201);

    const bulkTuesday = '2099-01-06';
    const bulkWeekday = new Date(`${bulkTuesday}T00:00:00Z`).getUTCDay() || 7;
    const payload = {
      serviceId: service.body.data.id,
      timezone: 'Asia/Taipei',
      dateFrom: bulkTuesday,
      dateTo: bulkTuesday,
      weekdays: [bulkWeekday === 0 ? 7 : bulkWeekday],
      timeRanges: [{ startTime: '10:00', endTime: '12:00' }],
    };

    const first = await request(app.getHttpServer())
      .post('/api/admin/availability-slots/bulk-generate')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send(payload)
      .expect(200);

    expect(typeof first.body.data.created).toBe('number');

    const second = await request(app.getHttpServer())
      .post('/api/admin/availability-slots/bulk-generate')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send(payload)
      .expect(200);

    expect(second.body.data.skipped).toBeGreaterThanOrEqual(1);
    expect(await hasAuditLog('admin.availability_slot.bulk_generate')).toBe(true);
  });

  // 建立與取消預約後應寫入 booking_status_logs。
  it('建立與取消預約會寫入 booking_status_logs', async () => {
    const adminEmail = `admin-booking-log-${runId}@example.com`;
    const memberEmail = `admin-member-log-${runId}@example.com`;

    const admin = await registerPromoteAndAdminLogin(adminEmail, 'Admin Booking Log');

    const member = await registerAndLogin(memberEmail, 'Member Booking Log');

    const service = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({
        name: `Log Service ${runId}`,
        durationMinutes: 60,
        price: 900,
        status: 'active',
      })
      .expect(201);

    const start = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const slot = await request(app.getHttpServer())
      .post('/api/admin/availability-slots')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({
        serviceId: service.body.data.id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'available',
      })
      .expect(201);

    const booking = await request(app.getHttpServer())
      .post('/api/admin/bookings')
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({
        userId: member.userId,
        availabilitySlotId: slot.body.data.id,
        note: 'admin created',
      })
      .expect(201);

    const bookingId = booking.body.data.id;

    const createLogCount = await queryScalar(
      `SELECT COUNT(*)::text FROM booking_status_logs WHERE booking_id = '${bookingId}' AND from_status IS NULL AND to_status = 'confirmed'`,
    );
    expect(Number(createLogCount)).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .post(`/api/admin/bookings/${bookingId}/cancel`)
      .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
      .send({ reason: 'admin cancel' })
      .expect(200);

    const cancelLogCount = await queryScalar(
      `SELECT COUNT(*)::text FROM booking_status_logs WHERE booking_id = '${bookingId}' AND from_status = 'confirmed' AND to_status = 'cancelled'`,
    );
    expect(Number(cancelLogCount)).toBeGreaterThanOrEqual(1);
  });

  describe('Admin 權限', () => {
    // 未登入呼叫 Admin API 應回 401。
    it('未登入呼叫 Admin API 回 401 UNAUTHENTICATED', async () => {
      const response = await request(app.getHttpServer()).get('/api/admin/services').expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    // 僅 member cookie 呼叫 Admin API 應回 401（無 admin session）。
    it('一般 member 呼叫 Admin API 回 401 UNAUTHENTICATED', async () => {
      const memberEmail = `admin-forbidden-${runId}@example.com`;
      const member = await registerAndLogin(memberEmail, 'Forbidden Member');

      const response = await request(app.getHttpServer())
        .get('/api/admin/services')
        .set('Cookie', sessionCookieHeader(member.token, 'member'))
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('Admin 服務管理邊界', () => {
    // Admin 服務列表應包含 hidden 服務，公開 API 則不包含。
    it('GET /api/admin/services 含 hidden 服務', async () => {
      const adminEmail = `admin-hidden-list-${runId}@example.com`;
      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Hidden List Admin');

      const hidden = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Hidden Svc ${runId}`,
          durationMinutes: 60,
          price: 300,
          status: 'hidden',
        })
        .expect(201);

      const adminList = await request(app.getHttpServer())
        .get('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .expect(200);

      expect(adminList.body.data.some((item: { id: string }) => item.id === hidden.body.data.id)).toBe(true);

      const publicList = await request(app.getHttpServer()).get('/api/services').expect(200);

      expect(publicList.body.data.some((item: { id: string }) => item.id === hidden.body.data.id)).toBe(false);
    });

    // Admin 可取得 hidden 服務詳情。
    it('GET /api/admin/services/:id 可取得 hidden 服務', async () => {
      const adminEmail = `admin-hidden-detail-${runId}@example.com`;
      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Hidden Detail Admin');

      const hidden = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Hidden Detail ${runId}`,
          durationMinutes: 60,
          price: 350,
          status: 'hidden',
        })
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/api/admin/services/${hidden.body.data.id}`)
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .expect(200);

      expect(detail.body.data.status).toBe('hidden');
    });
  });

  describe('Admin 時段管理邊界', () => {
    // inactive 服務不可建立新時段。
    it('Admin 替 inactive 服務建立時段被拒絕', async () => {
      const adminEmail = `admin-slot-inactive-${runId}@example.com`;
      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Slot Inactive Admin');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Inactive Slot Svc ${runId}`,
          durationMinutes: 60,
          price: 400,
          status: 'inactive',
        })
        .expect(201);

      const start = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const response = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(409);

      expect(response.body.error.code).toBe('SERVICE_NOT_ACTIVE');
    });

    // hidden 服務不可建立新時段。
    it('Admin 替 hidden 服務建立時段被拒絕', async () => {
      const adminEmail = `admin-slot-hidden-${runId}@example.com`;
      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Slot Hidden Admin');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Hidden Slot Svc ${runId}`,
          durationMinutes: 60,
          price: 450,
          status: 'hidden',
        })
        .expect(201);

      const start = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const response = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(409);

      expect(response.body.error.code).toBe('SERVICE_NOT_ACTIVE');
    });

    // 時段長度不符服務 durationMinutes 應拒絕。
    it('Admin 建立時段長度不符 durationMinutes 被拒絕', async () => {
      const adminEmail = `admin-slot-duration-${runId}@example.com`;
      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Slot Duration Admin');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Duration Svc ${runId}`,
          durationMinutes: 60,
          price: 500,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      const response = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_TIME_RANGE');
    });
  });

  describe('Admin 預約管理', () => {
    // 建立預約後應寫入 admin.booking.create audit log。
    it('Admin 建立預約寫入 admin.booking.create audit log', async () => {
      const adminEmail = `admin-audit-create-${runId}@example.com`;
      const memberEmail = `admin-audit-create-member-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Audit Create Admin');
      const member = await registerAndLogin(memberEmail, 'Audit Create Member');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Audit Create Svc ${runId}`,
          durationMinutes: 60,
          price: 900,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: member.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);

      const logs = await request(app.getHttpServer())
        .get('/api/admin/audit-logs')
        .query({ action: 'admin.booking.create', targetId: booking.body.data.id })
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .expect(200);

      expect(logs.body.data.length).toBeGreaterThanOrEqual(1);
    });

    // 更新預約備註應寫入 admin.booking.update audit log。
    it('PATCH /api/admin/bookings/:id 更新備註並寫入 audit log', async () => {
      const adminEmail = `admin-audit-update-${runId}@example.com`;
      const memberEmail = `admin-audit-update-member-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Audit Update Admin');
      const member = await registerAndLogin(memberEmail, 'Audit Update Member');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Audit Update Svc ${runId}`,
          durationMinutes: 60,
          price: 950,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 13 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: member.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/admin/bookings/${booking.body.data.id}`)
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({ note: 'updated by admin' })
        .expect(200);

      const logs = await request(app.getHttpServer())
        .get('/api/admin/audit-logs')
        .query({ action: 'admin.booking.update', targetId: booking.body.data.id })
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .expect(200);

      expect(logs.body.data.length).toBeGreaterThanOrEqual(1);
    });

    // Admin 取消預約應寫入 admin.booking.cancel audit log。
    it('Admin 取消預約寫入 admin.booking.cancel audit log', async () => {
      const adminEmail = `admin-audit-cancel-${runId}@example.com`;
      const memberEmail = `admin-audit-cancel-member-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Audit Cancel Admin');
      const member = await registerAndLogin(memberEmail, 'Audit Cancel Member');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Audit Cancel Svc ${runId}`,
          durationMinutes: 60,
          price: 980,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 14 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: member.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/admin/bookings/${booking.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({ reason: 'audit cancel' })
        .expect(200);

      const logs = await request(app.getHttpServer())
        .get('/api/admin/audit-logs')
        .query({ action: 'admin.booking.cancel', targetId: booking.body.data.id })
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .expect(200);

      expect(logs.body.data.length).toBeGreaterThanOrEqual(1);
    });

    // Admin 可取消 4 小時內開始的預約，不受會員取消限制。
    it('Admin 可取消 4 小時內開始的預約', async () => {
      const adminEmail = `admin-cancel-soon-${runId}@example.com`;
      const memberEmail = `admin-cancel-soon-member-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Cancel Soon Admin');
      const member = await registerAndLogin(memberEmail, 'Cancel Soon Member');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Cancel Soon Svc ${runId}`,
          durationMinutes: 60,
          price: 1000,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: member.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);

      const cancelled = await request(app.getHttpServer())
        .post(`/api/admin/bookings/${booking.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({ reason: 'admin within 4h' })
        .expect(200);

      expect(cancelled.body.data.status).toBe('cancelled');
    });

    // Admin 重複取消已取消預約應回 409。
    it('Admin 取消已取消預約回 BOOKING_NOT_CANCELABLE', async () => {
      const adminEmail = `admin-cancel-twice-${runId}@example.com`;
      const memberEmail = `admin-cancel-twice-member-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Cancel Twice Admin');
      const member = await registerAndLogin(memberEmail, 'Cancel Twice Member');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Cancel Twice Svc ${runId}`,
          durationMinutes: 60,
          price: 1010,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 15 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: member.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/admin/bookings/${booking.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({ reason: 'first' })
        .expect(200);

      const again = await request(app.getHttpServer())
        .post(`/api/admin/bookings/${booking.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({ reason: 'second' })
        .expect(409);

      expect(again.body.error.code).toBe('BOOKING_NOT_CANCELABLE');
    });

    // Admin 不可取消已 completed（時段已結束）的預約。
    it('Admin 取消 completed 預約回 BOOKING_NOT_CANCELABLE', async () => {
      const adminEmail = `admin-cancel-completed-${runId}@example.com`;
      const memberEmail = `admin-cancel-completed-member-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Cancel Completed Admin');
      const member = await registerAndLogin(memberEmail, 'Cancel Completed Member');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Cancel Completed Svc ${runId}`,
          durationMinutes: 60,
          price: 1020,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const end = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      const booking = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: member.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(`/api/admin/bookings/${booking.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({ reason: 'too late completed' })
        .expect(409);

      expect(response.body.error.code).toBe('BOOKING_NOT_CANCELABLE');
    });

    // 同一時段 Admin 建立第二筆預約應因超賣被拒。
    it('Admin 建立預約同 slot 第二筆回 409', async () => {
      const adminEmail = `admin-double-book-${runId}@example.com`;
      const memberAEmail = `admin-double-a-${runId}@example.com`;
      const memberBEmail = `admin-double-b-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Double Book Admin');
      const memberA = await registerAndLogin(memberAEmail, 'Double A');
      const memberB = await registerAndLogin(memberBEmail, 'Double B');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Double Book Svc ${runId}`,
          durationMinutes: 60,
          price: 1030,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 16 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: memberA.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: memberB.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(409);

      expect(second.body.error.code).toBe('BOOKING_SLOT_UNAVAILABLE');
    });

    // Admin 可為 1 小時內開始的時段建立預約。
    it('Admin 建立預約不受 1 小時限制', async () => {
      const adminEmail = `admin-book-soon-${runId}@example.com`;
      const memberEmail = `admin-book-soon-member-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Book Soon Admin');
      const member = await registerAndLogin(memberEmail, 'Book Soon Member');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Book Soon Svc ${runId}`,
          durationMinutes: 60,
          price: 1040,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 30 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'available',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: member.userId,
          availabilitySlotId: slot.body.data.id,
        })
        .expect(201);
    });

    // Admin 預約列表可查詢不同會員的預約。
    it('GET /api/admin/bookings 可查不同會員預約', async () => {
      const adminEmail = `admin-list-bookings-${runId}@example.com`;
      const memberAEmail = `admin-list-a-${runId}@example.com`;
      const memberBEmail = `admin-list-b-${runId}@example.com`;

      const admin = await registerPromoteAndAdminLogin(adminEmail, 'List Bookings Admin');
      const memberA = await registerAndLogin(memberAEmail, 'List A');
      const memberB = await registerAndLogin(memberBEmail, 'List B');

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `List Bookings Svc ${runId}`,
          durationMinutes: 60,
          price: 1050,
          status: 'active',
        })
        .expect(201);

      const startA = new Date(Date.now() + 17 * 60 * 60 * 1000);
      const endA = new Date(startA.getTime() + 60 * 60 * 1000);
      const startB = new Date(Date.now() + 18 * 60 * 60 * 1000);
      const endB = new Date(startB.getTime() + 60 * 60 * 1000);

      const slotA = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: startA.toISOString(),
          endAt: endA.toISOString(),
          status: 'available',
        })
        .expect(201);

      const slotB = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          serviceId: service.body.data.id,
          startAt: startB.toISOString(),
          endAt: endB.toISOString(),
          status: 'available',
        })
        .expect(201);

      const bookingA = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: memberA.userId,
          availabilitySlotId: slotA.body.data.id,
        })
        .expect(201);

      const bookingB = await request(app.getHttpServer())
        .post('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          userId: memberB.userId,
          availabilitySlotId: slotB.body.data.id,
        })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/admin/bookings')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .expect(200);

      const ids = list.body.data.map((item: { id: string }) => item.id);
      expect(ids).toContain(bookingA.body.data.id);
      expect(ids).toContain(bookingB.body.data.id);
    });

    // audit-logs 可依 action 篩選查詢。
    it('GET /api/admin/audit-logs 可依 action 查詢', async () => {
      const adminEmail = `admin-audit-filter-${runId}@example.com`;
      const admin = await registerPromoteAndAdminLogin(adminEmail, 'Audit Filter Admin');

      await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .send({
          name: `Audit Filter Svc ${runId}`,
          durationMinutes: 60,
          price: 1060,
          status: 'active',
        })
        .expect(201);

      const logs = await request(app.getHttpServer())
        .get('/api/admin/audit-logs')
        .query({ action: 'admin.service.create' })
        .set('Cookie', sessionCookieHeader(admin.token, 'admin'))
        .expect(200);

      expect(logs.body.data.every((item: { action: string }) => item.action === 'admin.service.create')).toBe(true);
      expect(logs.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
