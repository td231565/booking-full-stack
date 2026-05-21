import { http, HttpResponse } from 'msw';

const API_BASE_URL = 'http://127.0.0.1:3001';

// 建立預設成功回應的 MSW handler，供元件測試攔截 apiFetch 請求。
export const handlers = [
  http.post(`${API_BASE_URL}/api/auth/register`, () => {
    return HttpResponse.json({
      data: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: '測試使用者',
        role: 'user',
        status: 'active',
      },
    });
  }),
  http.post(`${API_BASE_URL}/api/auth/login`, () => {
    return HttpResponse.json({
      data: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: '測試使用者',
        role: 'user',
        status: 'active',
      },
    });
  }),
  http.get(`${API_BASE_URL}/api/auth/me`, () => {
    return HttpResponse.json({
      data: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: '測試使用者',
        role: 'user',
        status: 'active',
      },
    });
  }),
  http.post(`${API_BASE_URL}/api/bookings`, () => {
    return HttpResponse.json({
      data: {
        id: 'booking-1',
        userId: 'user-1',
        serviceId: 'service-1',
        availabilitySlotId: 'slot-1',
        status: 'confirmed',
        note: null,
        createdAt: '2026-05-21T10:00:00.000Z',
      },
    });
  }),
];
