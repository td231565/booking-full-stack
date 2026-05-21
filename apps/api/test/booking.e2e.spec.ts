import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestDataSource, promoteUserToAdmin } from './helpers/test-db';
import { createTestApp } from './helpers/create-test-app';
import { parseSessionCookie, sessionCookieHeader } from './helpers/http';

type AuthSession = {
  token: string;
  userId: string;
  email: string;
};

describe('Booking API (integration)', () => {
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

  // 註冊並登入，回傳 session 與 userId 供預約流程測試使用。
  async function registerAndLogin(
    email: string,
    displayName: string,
    forwardedOctet: number,
  ): Promise<AuthSession> {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', `10.20.${forwardedOctet}.1`)
      .send({ email, password, displayName });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', `10.20.${forwardedOctet}.1`)
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

  // 建立 admin 服務與可預約時段，回傳 slotId 供 booking 案例共用。
  async function createServiceWithSlot(
    adminToken: string,
    hoursFromNow: number,
  ): Promise<{ serviceId: string; slotId: string }> {
    const service = await request(app.getHttpServer())
      .post('/api/admin/services')
      .set('Cookie', sessionCookieHeader(adminToken))
      .send({
        name: `Booking Svc ${runId}-${hoursFromNow}`,
        durationMinutes: 60,
        price: 1000,
        status: 'active',
      })
      .expect(201);

    const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const slot = await request(app.getHttpServer())
      .post('/api/admin/availability-slots')
      .set('Cookie', sessionCookieHeader(adminToken))
      .send({
        serviceId: service.body.data.id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        status: 'available',
      })
      .expect(201);

    return {
      serviceId: service.body.data.id,
      slotId: slot.body.data.id,
    };
  }

  // 同一時段並發建立預約只允許一筆成功。
  it('POST /api/bookings 同一時段並發兩次只允許一筆', async () => {
    const adminEmail = `booking-admin-race-${runId}@example.com`;
    const memberAEmail = `booking-member-a-${runId}@example.com`;
    const memberBEmail = `booking-member-b-${runId}@example.com`;

    const admin = await registerAndLogin(adminEmail, 'Race Admin', 1);
    await promoteUserToAdmin(admin.email);

    const memberA = await registerAndLogin(memberAEmail, 'Member A', 2);
    const memberB = await registerAndLogin(memberBEmail, 'Member B', 3);
    const { slotId } = await createServiceWithSlot(admin.token, 5);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(memberA.token))
        .send({ availabilitySlotId: slotId }),
      request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(memberB.token))
        .send({ availabilitySlotId: slotId }),
    ]);

    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([201, 409]);
  });

  // 距離開始少於 4 小時的預約不可取消。
  it('POST /api/me/bookings/:id/cancel 套用 4 小時取消規則', async () => {
    const adminEmail = `booking-admin-cancel-${runId}@example.com`;
    const memberEmail = `booking-member-cancel-${runId}@example.com`;

    const admin = await registerAndLogin(adminEmail, 'Cancel Admin', 4);
    await promoteUserToAdmin(admin.email);

    const member = await registerAndLogin(memberEmail, 'Cancel Member', 5);
    const { slotId } = await createServiceWithSlot(admin.token, 2);

    const created = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', sessionCookieHeader(member.token))
      .send({ availabilitySlotId: slotId })
      .expect(201);

    const tooLate = await request(app.getHttpServer())
      .post(`/api/me/bookings/${created.body.data.id}/cancel`)
      .set('Cookie', sessionCookieHeader(member.token))
      .send({ reason: 'too late' })
      .expect(409);

    expect(tooLate.body.error.code).toBe('BOOKING_CANCEL_TOO_LATE');
  });

  // GET /api/me/bookings 僅回傳自己的預約。
  it('GET /api/me/bookings 僅回傳自己的預約', async () => {
    const adminEmail = `booking-admin-list-${runId}@example.com`;
    const memberAEmail = `booking-list-a-${runId}@example.com`;
    const memberBEmail = `booking-list-b-${runId}@example.com`;

    const admin = await registerAndLogin(adminEmail, 'List Admin', 6);
    await promoteUserToAdmin(admin.email);

    const memberA = await registerAndLogin(memberAEmail, 'List A', 7);
    const memberB = await registerAndLogin(memberBEmail, 'List B', 8);

    const slotA = await createServiceWithSlot(admin.token, 6);
    const slotB = await createServiceWithSlot(admin.token, 7);

    await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', sessionCookieHeader(memberA.token))
      .send({ availabilitySlotId: slotA.slotId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', sessionCookieHeader(memberB.token))
      .send({ availabilitySlotId: slotB.slotId })
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/me/bookings')
      .set('Cookie', sessionCookieHeader(memberA.token))
      .expect(200);

    expect(listA.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listA.body.data.every((item: { slot: { id: string } }) => item.slot.id === slotA.slotId)).toBe(true);
    expect(listA.body.data.some((item: { slot: { id: string } }) => item.slot.id === slotB.slotId)).toBe(false);
  });

  // 會員不可查看他人預約詳情（回 BOOKING_NOT_FOUND）。
  it('GET /api/me/bookings/:id 他人預約回 404', async () => {
    const adminEmail = `booking-admin-peek-${runId}@example.com`;
    const ownerEmail = `booking-owner-${runId}@example.com`;
    const otherEmail = `booking-other-${runId}@example.com`;

    const admin = await registerAndLogin(adminEmail, 'Peek Admin', 9);
    await promoteUserToAdmin(admin.email);

    const owner = await registerAndLogin(ownerEmail, 'Owner', 10);
    const other = await registerAndLogin(otherEmail, 'Other', 11);
    const { slotId } = await createServiceWithSlot(admin.token, 8);

    const booking = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', sessionCookieHeader(owner.token))
      .send({ availabilitySlotId: slotId })
      .expect(201);

    const peek = await request(app.getHttpServer())
      .get(`/api/me/bookings/${booking.body.data.id}`)
      .set('Cookie', sessionCookieHeader(other.token))
      .expect(404);

    expect(peek.body.error.code).toBe('BOOKING_NOT_FOUND');
  });
});
