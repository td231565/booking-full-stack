import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/msw/server';
import { ApiClientError } from '@/lib/api/client';
import {
  AdminAvailabilitySlot,
  AdminBooking,
  cancelAdminBooking,
  createAdminBooking,
  getAdminAvailableSlots,
  getAdminBookingsByDateRange,
  lookupAdminUserByEmail,
  updateAdminBooking,
} from './admin-api';

const API_BASE = 'http://127.0.0.1:3001';

const sampleBooking: AdminBooking = {
  id: 'booking-1',
  status: 'confirmed',
  note: '測試備註',
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  user: {
    id: 'user-1',
    email: 'member@example.com',
    displayName: '測試會員',
  },
  service: {
    id: 'service-1',
    name: '測試服務',
  },
  slot: {
    id: 'slot-1',
    startAt: '2026-06-01T10:00:00.000Z',
    endAt: '2026-06-01T11:00:00.000Z',
  },
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const sampleSlot: AdminAvailabilitySlot = {
  id: 'slot-2',
  serviceId: 'service-1',
  startAt: '2026-06-02T10:00:00.000Z',
  endAt: '2026-06-02T11:00:00.000Z',
  status: 'available',
  service: {
    id: 'service-1',
    name: '測試服務',
    durationMinutes: 60,
    status: 'active',
  },
};

describe('getAdminBookingsByDateRange', () => {
  it('帶 from 與 to 參數查詢時回傳預約列表', async () => {
    server.use(
      http.get(`${API_BASE}/api/admin/bookings`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('from')).toBe('2026-06-01T00:00:00Z');
        expect(url.searchParams.get('to')).toBe('2026-06-30T23:59:59Z');
        return HttpResponse.json({
          data: [sampleBooking],
          meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        });
      }),
    );

    const result = await getAdminBookingsByDateRange('2026-06-01T00:00:00Z', '2026-06-30T23:59:59Z');

    expect(result.data).toEqual([sampleBooking]);
  });
});

describe('createAdminBooking', () => {
  // POST 成功時應回傳含 data 的預約物件。
  it('POST 成功時回傳 AdminBooking', async () => {
    let requestBody: unknown;

    server.use(
      http.post(`${API_BASE}/api/admin/bookings`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ data: sampleBooking }, { status: 201 });
      }),
    );

    const result = await createAdminBooking({
      userId: 'user-1',
      availabilitySlotId: 'slot-1',
      note: '測試備註',
    });

    expect(requestBody).toEqual({
      userId: 'user-1',
      availabilitySlotId: 'slot-1',
      note: '測試備註',
    });
    expect(result).toEqual({ data: sampleBooking });
  });

  // 時段不可用時後端回 409，前端應轉成 ApiClientError。
  it('API 回 409 時拋 ApiClientError', async () => {
    server.use(
      http.post(`${API_BASE}/api/admin/bookings`, () => {
        return HttpResponse.json(
          {
            error: {
              code: 'BOOKING_SLOT_UNAVAILABLE',
              message: '此時段目前不可預約',
            },
          },
          { status: 409 },
        );
      }),
    );

    await expect(
      createAdminBooking({
        userId: 'user-1',
        availabilitySlotId: 'slot-taken',
      }),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'BOOKING_SLOT_UNAVAILABLE',
      status: 409,
    });
  });
});

describe('updateAdminBooking', () => {
  // PATCH 更新備註成功時應回傳更新後的預約。
  it('PATCH 更新 note 成功時回傳 AdminBooking', async () => {
    let requestBody: unknown;

    server.use(
      http.patch(`${API_BASE}/api/admin/bookings/booking-1`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          data: { ...sampleBooking, note: '更新後備註' },
        });
      }),
    );

    const result = await updateAdminBooking('booking-1', { note: '更新後備註' });

    expect(requestBody).toEqual({ note: '更新後備註' });
    expect(result.data.note).toBe('更新後備註');
  });

  // PATCH 改期成功時應帶 availabilitySlotId。
  it('PATCH 改期成功時回傳 AdminBooking', async () => {
    let requestBody: unknown;
    const rescheduled = {
      ...sampleBooking,
      slot: { ...sampleBooking.slot, id: 'slot-2' },
    };

    server.use(
      http.patch(`${API_BASE}/api/admin/bookings/booking-1`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ data: rescheduled });
      }),
    );

    const result = await updateAdminBooking('booking-1', { availabilitySlotId: 'slot-2' });

    expect(requestBody).toEqual({ availabilitySlotId: 'slot-2' });
    expect(result.data.slot.id).toBe('slot-2');
  });

  // 改期至不可用時段應拋 ApiClientError。
  it('API 回 409 時拋 ApiClientError', async () => {
    server.use(
      http.patch(`${API_BASE}/api/admin/bookings/booking-1`, () => {
        return HttpResponse.json(
          {
            error: {
              code: 'BOOKING_SLOT_UNAVAILABLE',
              message: '此時段目前不可預約',
            },
          },
          { status: 409 },
        );
      }),
    );

    await expect(updateAdminBooking('booking-1', { availabilitySlotId: 'slot-blocked' })).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});

describe('cancelAdminBooking', () => {
  // POST cancel 成功時應回傳已取消的預約。
  it('POST 成功時回傳已取消的 AdminBooking', async () => {
    let requestBody: unknown;
    const cancelled = {
      ...sampleBooking,
      status: 'cancelled' as const,
      cancelledAt: '2026-05-02T00:00:00.000Z',
      cancelledBy: 'admin' as const,
      cancelReason: '管理員取消',
    };

    server.use(
      http.post(`${API_BASE}/api/admin/bookings/booking-1/cancel`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({ data: cancelled });
      }),
    );

    const result = await cancelAdminBooking('booking-1', { reason: '管理員取消' });

    expect(requestBody).toEqual({ reason: '管理員取消' });
    expect(result.data.status).toBe('cancelled');
    expect(result.data.cancelReason).toBe('管理員取消');
  });

  // 重複取消應拋 ApiClientError。
  it('API 回 409 時拋 ApiClientError', async () => {
    server.use(
      http.post(`${API_BASE}/api/admin/bookings/booking-1/cancel`, () => {
        return HttpResponse.json(
          {
            error: {
              code: 'BOOKING_NOT_CANCELABLE',
              message: '預約狀態不可取消',
            },
          },
          { status: 409 },
        );
      }),
    );

    await expect(cancelAdminBooking('booking-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'BOOKING_NOT_CANCELABLE',
      status: 409,
    });
  });
});

describe('lookupAdminUserByEmail', () => {
  // 找到 active 會員時回傳 user 資料。
  it('找到時回傳 user', async () => {
    const user = {
      id: 'user-1',
      email: 'member@example.com',
      displayName: '測試會員',
    };

    server.use(
      http.get(`${API_BASE}/api/admin/users/lookup`, ({ request }) => {
        const email = new URL(request.url).searchParams.get('email');
        expect(email).toBe('member@example.com');
        return HttpResponse.json({ data: user });
      }),
    );

    const result = await lookupAdminUserByEmail('member@example.com');

    expect(result).toEqual({ data: user });
  });

  // email 不存在時應拋 ApiClientError。
  it('404 時拋 ApiClientError', async () => {
    server.use(
      http.get(`${API_BASE}/api/admin/users/lookup`, () => {
        return HttpResponse.json(
          {
            error: {
              code: 'USER_NOT_FOUND',
              message: '找不到會員',
            },
          },
          { status: 404 },
        );
      }),
    );

    await expect(lookupAdminUserByEmail('missing@example.com')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'USER_NOT_FOUND',
      status: 404,
    });
  });
});

describe('getAdminAvailableSlots', () => {
  // 依 serviceId 查詢 available 時段列表。
  it('帶 serviceId 與 status=available 查詢時回傳時段列表', async () => {
    server.use(
      http.get(`${API_BASE}/api/admin/availability-slots`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('serviceId')).toBe('service-1');
        expect(url.searchParams.get('status')).toBe('available');
        return HttpResponse.json({
          data: [sampleSlot],
          meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        });
      }),
    );

    const result = await getAdminAvailableSlots('service-1');

    expect(result.data).toEqual([sampleSlot]);
    expect(result.meta.total).toBe(1);
  });
});
