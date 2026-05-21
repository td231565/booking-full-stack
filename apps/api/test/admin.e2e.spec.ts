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

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await closeTestDataSource();
  });

  // 註冊並登入，回傳 session 供 Admin API 測試使用。
  async function registerAndLogin(email: string, displayName: string): Promise<AuthSession> {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.30.${runId % 200}.1`)
      .send({ email, password, displayName });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.30.${runId % 200}.1`)
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

  // Admin CRUD 服務與時段，並驗證 audit log 寫入。
  it('Admin 可 CRUD 服務與時段並寫入 audit log', async () => {
    const adminEmail = `admin-crud-${runId}@example.com`;
    const admin = await registerAndLogin(adminEmail, 'Admin CRUD');
    await promoteUserToAdmin(admin.email);

    const created = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set('Cookie', sessionCookieHeader(admin.token))
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
      .set('Cookie', sessionCookieHeader(admin.token))
      .send({ name: `Admin Service Updated ${runId}` })
      .expect(200);

    const start = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const slot = await request(app.getHttpServer())
      .post('/api/admin/availability-slots')
      .set('Cookie', sessionCookieHeader(admin.token))
      .send({
        serviceId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'available',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/admin/availability-slots/${slot.body.data.id}`)
      .set('Cookie', sessionCookieHeader(admin.token))
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
    const admin = await registerAndLogin(adminEmail, 'Admin Bulk');
    await promoteUserToAdmin(admin.email);

    const service = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set('Cookie', sessionCookieHeader(admin.token))
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
      .set('Cookie', sessionCookieHeader(admin.token))
      .send(payload)
      .expect(200);

    expect(typeof first.body.data.created).toBe('number');

    const second = await request(app.getHttpServer())
      .post('/api/admin/availability-slots/bulk-generate')
      .set('Cookie', sessionCookieHeader(admin.token))
      .send(payload)
      .expect(200);

    expect(second.body.data.skipped).toBeGreaterThanOrEqual(1);
    expect(await hasAuditLog('admin.availability_slot.bulk_generate')).toBe(true);
  });

  // 建立與取消預約後應寫入 booking_status_logs。
  it('建立與取消預約會寫入 booking_status_logs', async () => {
    const adminEmail = `admin-booking-log-${runId}@example.com`;
    const memberEmail = `admin-member-log-${runId}@example.com`;

    const admin = await registerAndLogin(adminEmail, 'Admin Booking Log');
    await promoteUserToAdmin(admin.email);

    const member = await registerAndLogin(memberEmail, 'Member Booking Log');

    const service = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set('Cookie', sessionCookieHeader(admin.token))
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
      .set('Cookie', sessionCookieHeader(admin.token))
      .send({
        serviceId: service.body.data.id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'available',
      })
      .expect(201);

    const booking = await request(app.getHttpServer())
      .post('/api/admin/bookings')
      .set('Cookie', sessionCookieHeader(admin.token))
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
      .set('Cookie', sessionCookieHeader(admin.token))
      .send({ reason: 'admin cancel' })
      .expect(200);

    const cancelLogCount = await queryScalar(
      `SELECT COUNT(*)::text FROM booking_status_logs WHERE booking_id = '${bookingId}' AND from_status = 'confirmed' AND to_status = 'cancelled'`,
    );
    expect(Number(cancelLogCount)).toBeGreaterThanOrEqual(1);
  });
});
