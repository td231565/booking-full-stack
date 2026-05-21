import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeTestDataSource, countBookingStatusLogs, promoteUserToAdmin, queryScalar } from './helpers/test-db';
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
      serviceId: service.body.data.id as string,
      slotId: slot.body.data.id as string,
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

  describe('Booking Happy path', () => {
    // 會員建立預約成功並回傳預期欄位。
    it('POST /api/bookings 會員建立預約成功', async () => {
      const adminEmail = `booking-happy-admin-${runId}@example.com`;
      const memberEmail = `booking-happy-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Happy Admin', 12);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Happy Member', 13);
      const { slotId } = await createServiceWithSlot(admin.token, 5);

      const created = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId, note: 'member booking' })
        .expect(201);

      expect(created.body.data).toMatchObject({
        status: 'confirmed',
        note: 'member booking',
        availabilitySlotId: slotId,
      });
    });

    // 建立預約後應寫入 null → confirmed 的 booking_status_logs。
    it('POST /api/bookings 成功後寫入 booking_status_logs null → confirmed', async () => {
      const adminEmail = `booking-log-create-admin-${runId}@example.com`;
      const memberEmail = `booking-log-create-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Log Create Admin', 14);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Log Create Member', 15);
      const { slotId } = await createServiceWithSlot(admin.token, 6);

      const created = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(201);

      const logCount = await queryScalar(
        `SELECT COUNT(*)::text FROM booking_status_logs WHERE booking_id = '${created.body.data.id}' AND from_status IS NULL AND to_status = 'confirmed'`,
      );
      expect(Number(logCount)).toBeGreaterThanOrEqual(1);
    });

    // 會員可取消自己的預約並回傳 cancelled。
    it('POST /api/me/bookings/:id/cancel 會員取消自己的預約成功', async () => {
      const adminEmail = `booking-cancel-ok-admin-${runId}@example.com`;
      const memberEmail = `booking-cancel-ok-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Cancel OK Admin', 16);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Cancel OK Member', 17);
      const { slotId } = await createServiceWithSlot(admin.token, 10);

      const created = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(201);

      const cancelled = await request(app.getHttpServer())
        .post(`/api/me/bookings/${created.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ reason: 'change plan' })
        .expect(200);

      expect(cancelled.body.data.status).toBe('cancelled');
    });

    // 取消成功後應寫入 confirmed → cancelled 的 booking_status_logs。
    it('POST /api/me/bookings/:id/cancel 成功後寫入 booking_status_logs confirmed → cancelled', async () => {
      const adminEmail = `booking-log-cancel-admin-${runId}@example.com`;
      const memberEmail = `booking-log-cancel-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Log Cancel Admin', 18);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Log Cancel Member', 19);
      const { slotId } = await createServiceWithSlot(admin.token, 11);

      const created = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/me/bookings/${created.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ reason: 'done' })
        .expect(200);

      const logCount = await queryScalar(
        `SELECT COUNT(*)::text FROM booking_status_logs WHERE booking_id = '${created.body.data.id}' AND from_status = 'confirmed' AND to_status = 'cancelled'`,
      );
      expect(Number(logCount)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Booking 反向與邊界', () => {
    // 未登入建立預約應回 401。
    it('POST /api/bookings 未登入回 401 UNAUTHENTICATED', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .send({ availabilitySlotId: '00000000-0000-0000-0000-000000000000' })
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    // 未登入取消預約應回 401。
    it('POST /api/me/bookings/:id/cancel 未登入回 401 UNAUTHENTICATED', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/me/bookings/00000000-0000-0000-0000-000000000000/cancel')
        .send({ reason: 'no auth' })
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    // 服務改為 inactive 後，會員不可預約其時段。
    it('POST /api/bookings 服務非 active 回 SERVICE_NOT_ACTIVE', async () => {
      const adminEmail = `booking-inactive-admin-${runId}@example.com`;
      const memberEmail = `booking-inactive-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Inactive Admin', 20);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Inactive Member', 21);
      const { serviceId, slotId } = await createServiceWithSlot(admin.token, 5);

      await request(app.getHttpServer())
        .patch(`/api/admin/services/${serviceId}`)
        .set('Cookie', sessionCookieHeader(admin.token))
        .send({ status: 'inactive' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(409);

      expect(response.body.error.code).toBe('SERVICE_NOT_ACTIVE');
    });

    // blocked 時段不可預約。
    it('POST /api/bookings 時段非 available 回 BOOKING_SLOT_UNAVAILABLE', async () => {
      const adminEmail = `booking-blocked-admin-${runId}@example.com`;
      const memberEmail = `booking-blocked-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Blocked Admin', 22);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Blocked Member', 23);

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token))
        .send({
          name: `Blocked Svc ${runId}`,
          durationMinutes: 60,
          price: 600,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const slot = await request(app.getHttpServer())
        .post('/api/admin/availability-slots')
        .set('Cookie', sessionCookieHeader(admin.token))
        .send({
          serviceId: service.body.data.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          status: 'blocked',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slot.body.data.id })
        .expect(409);

      expect(response.body.error.code).toBe('BOOKING_SLOT_UNAVAILABLE');
    });

    // 1 小時內開始的時段不可預約。
    it('POST /api/bookings 時段開始 ≤ 1 小時後回 BOOKING_TOO_SOON', async () => {
      const adminEmail = `booking-soon-admin-${runId}@example.com`;
      const memberEmail = `booking-soon-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Soon Admin', 24);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Soon Member', 25);
      const { slotId } = await createServiceWithSlot(admin.token, 0.5);

      const response = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(409);

      expect(response.body.error.code).toBe('BOOKING_TOO_SOON');
    });

    // 同一會員重複預約同一時段應回 BOOKING_DUPLICATED。
    it('POST /api/bookings 同一會員重複預約回 BOOKING_DUPLICATED', async () => {
      const adminEmail = `booking-dup-admin-${runId}@example.com`;
      const memberEmail = `booking-dup-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Dup Admin', 26);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Dup Member', 27);
      const { slotId } = await createServiceWithSlot(admin.token, 5);

      await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(201);

      const duplicate = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(409);

      expect(duplicate.body.error.code).toBe('BOOKING_DUPLICATED');
    });

    // 已取消預約不可再次取消。
    it('POST /api/me/bookings/:id/cancel 已取消預約回 BOOKING_NOT_CANCELABLE', async () => {
      const adminEmail = `booking-cancel-twice-admin-${runId}@example.com`;
      const memberEmail = `booking-cancel-twice-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Cancel Twice Admin', 28);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Cancel Twice Member', 29);
      const { slotId } = await createServiceWithSlot(admin.token, 10);

      const created = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ availabilitySlotId: slotId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/me/bookings/${created.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ reason: 'first' })
        .expect(200);

      const again = await request(app.getHttpServer())
        .post(`/api/me/bookings/${created.body.data.id}/cancel`)
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ reason: 'second' })
        .expect(409);

      expect(again.body.error.code).toBe('BOOKING_NOT_CANCELABLE');
    });

    // 取消不存在的預約應回 404。
    it('POST /api/me/bookings/:id/cancel 不存在預約回 BOOKING_NOT_FOUND', async () => {
      const memberEmail = `booking-cancel-missing-${runId}@example.com`;
      const member = await registerAndLogin(memberEmail, 'Cancel Missing', 30);

      const response = await request(app.getHttpServer())
        .post('/api/me/bookings/00000000-0000-0000-0000-000000000001/cancel')
        .set('Cookie', sessionCookieHeader(member.token))
        .send({ reason: 'missing' })
        .expect(404);

      expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
  });

  describe('Booking 對外狀態計算', () => {
    // 結束時間已過的預約查詢時對外顯示 completed。
    it('GET /api/me/bookings 已結束預約顯示 status completed', async () => {
      const adminEmail = `booking-completed-admin-${runId}@example.com`;
      const memberEmail = `booking-completed-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Completed Admin', 31);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Completed Member', 32);

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token))
        .send({
          name: `Completed Svc ${runId}`,
          durationMinutes: 60,
          price: 700,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const end = new Date(Date.now() - 2 * 60 * 60 * 1000);

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
        })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/me/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .expect(200);

      const item = list.body.data.find((row: { id: string }) => row.id === booking.body.data.id);
      expect(item?.status).toBe('completed');
    });

    // completed 為查詢時計算，不應多寫一筆 booking_status_logs。
    it('completed 預約不額外寫入 booking_status_logs', async () => {
      const adminEmail = `booking-completed-log-admin-${runId}@example.com`;
      const memberEmail = `booking-completed-log-member-${runId}@example.com`;

      const admin = await registerAndLogin(adminEmail, 'Completed Log Admin', 33);
      await promoteUserToAdmin(admin.email);

      const member = await registerAndLogin(memberEmail, 'Completed Log Member', 34);

      const service = await request(app.getHttpServer())
        .post('/api/admin/services')
        .set('Cookie', sessionCookieHeader(admin.token))
        .send({
          name: `Completed Log Svc ${runId}`,
          durationMinutes: 60,
          price: 750,
          status: 'active',
        })
        .expect(201);

      const start = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const end = new Date(Date.now() - 3 * 60 * 60 * 1000);

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
        })
        .expect(201);

      await request(app.getHttpServer())
        .get('/api/me/bookings')
        .set('Cookie', sessionCookieHeader(member.token))
        .expect(200);

      expect(await countBookingStatusLogs(booking.body.data.id)).toBe(1);
    });
  });
});
