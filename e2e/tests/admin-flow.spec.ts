import { expect } from '@playwright/test';
import {
  buildBrowserSessionCookies,
  bulkGenerateAdminAvailabilitySlots,
  cancelAdminBooking,
  createAdminAvailabilitySlot,
  createAdminBooking,
  createAdminService,
  findAdminServiceIdByName,
  readApiErrorCode,
  registerAndLogin,
  sessionCookieHeader,
  tryCreateAdminAvailabilitySlot,
  updateAdminService,
} from '../helpers/api';
import { API_BASE_URL, SEED_SERVICE_NAMES } from '../helpers/constants';
import { adminTest, test } from '../fixtures/auth';

test.describe('後台權限', () => {
  // 反向流程：僅 member session 無法進入後台 dashboard，會導向後台登入頁。
  test('非 admin 僅 member cookie 訪問後台會導向登入', async ({ page, request, runId }) => {
    const email = `e2e-member-admin-${runId}@example.com`;
    const session = await registerAndLogin(request, email, 'Member No Admin');

    await page.context().addCookies(buildBrowserSessionCookies(session.token, 'member'));

    await page.goto('/admin/services');

    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: '後台管理系統' })).toBeVisible();
  });

  // 反向流程：未登入訪問後台 dashboard 同樣導向後台登入頁。
  test('未登入訪問後台服務管理會導向登入', async ({ page }) => {
    await page.goto('/admin/services');

    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: '後台管理系統' })).toBeVisible();
  });
});

adminTest.describe('後台管理 golden path', () => {
  // Happy path：admin 建立服務後，服務管理頁可看到新服務（後台 UI 為唯讀，操作經 Admin API）。
  adminTest('admin 建立服務後出現在服務管理列表', async ({ adminPage, request, runId, adminSession }) => {
    const serviceName = `E2E Admin 服務 ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);

    await adminPage.goto('/admin/services');

    const card = adminPage.locator('section').filter({ hasText: serviceName });
    await expect(card.getByRole('heading', { name: serviceName })).toBeVisible();
    await expect(card.getByText('啟用')).toBeVisible();

    const listedId = await findAdminServiceIdByName(request, adminSession.token, serviceName);
    expect(listedId).toBe(serviceId);
  });

  // Happy path：admin 建立時段後，API 可查到且時段管理頁可正常載入（列表可能分頁，不以 UI 全文搜尋）。
  adminTest('admin 建立時段後出現在時段管理列表', async ({ adminPage, request, runId, adminSession }) => {
    const serviceName = `E2E Admin 時段服務 ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);
    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 48, 60);

    const slotResponse = await request.get(`${API_BASE_URL}/api/admin/availability-slots/${slotId}`, {
      headers: { Cookie: sessionCookieHeader(adminSession.token, 'admin') },
    });
    expect(slotResponse.ok()).toBeTruthy();
    const slot = (await slotResponse.json()) as { data: { id: string; service: { name: string } } };
    expect(slot.data.id).toBe(slotId);
    expect(slot.data.service.name).toBe(serviceName);

    await adminPage.goto('/admin/availability');

    await expect(adminPage.locator('main').getByRole('heading', { name: '時段管理' })).toBeVisible();
    await expect(adminPage.locator('main section').first()).toBeVisible();
  });

  // Happy path：admin 替會員建立預約後，預約管理頁顯示已成立。
  adminTest('admin 建立預約後出現在預約管理列表', async ({ adminPage, request, runId, adminSession }) => {
    const memberEmail = `e2e-admin-book-member-${runId}@example.com`;
    const member = await registerAndLogin(request, memberEmail, 'Admin Book Member');

    const serviceName = `E2E Admin 預約服務 ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);
    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 2, 60);

    await createAdminBooking(request, adminSession.token, member.userId, slotId, 'admin e2e booking');

    await adminPage.goto('/admin/bookings');

    const card = adminPage.locator('section').filter({ hasText: serviceName });
    await expect(card.getByText(memberEmail)).toBeVisible();
    await expect(card.getByText('已成立')).toBeVisible();
    await expect(card.getByText('備註：admin e2e booking')).toBeVisible();
  });

  // Happy path：admin 取消預約後，預約管理頁狀態變為已取消。
  adminTest('admin 取消預約後列表顯示已取消', async ({ adminPage, request, runId, adminSession }) => {
    const memberEmail = `e2e-admin-cancel-member-${runId}@example.com`;
    const member = await registerAndLogin(request, memberEmail, 'Admin Cancel Member');

    const serviceName = `E2E Admin 取消服務 ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);
    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 2, 60);
    const bookingId = await createAdminBooking(request, adminSession.token, member.userId, slotId);

    const cancelled = await cancelAdminBooking(request, adminSession.token, bookingId, 'admin e2e cancel');
    expect(cancelled.ok()).toBeTruthy();

    await adminPage.goto('/admin/bookings');

    // 點擊「已取消」分頁，以顯示已被取消的預約
    await adminPage.getByRole('button', { name: '已取消' }).click();

    const card = adminPage.locator('section').filter({ hasText: serviceName });
    await expect(card.getByText('已取消')).toBeVisible();
  });

  // Happy path：後台根路由導向預約管理，sidebar 可進入各管理區塊。
  adminTest('admin 可進入後台首頁導覽', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(adminPage).toHaveURL(/\/admin\/bookings$/);
    await expect(adminPage.locator('main').getByRole('heading', { name: '預約管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '服務管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '時段管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '預約管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '稽核紀錄' })).toBeVisible();
  });

  // Happy path：admin 可查看 hidden 服務（自行建立，避免 seed 被分頁擠出列表）。
  adminTest('admin 可查看 hidden 服務', async ({ adminPage, request, runId, adminSession }) => {
    const serviceName = `E2E Hidden View ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);
    await updateAdminService(request, adminSession.token, serviceId, { status: 'hidden' });

    await adminPage.goto('/admin/services');

    await expect(adminPage.locator('main').getByRole('heading', { name: '服務管理' })).toBeVisible();
    const hiddenCard = adminPage.locator('section').filter({ hasText: serviceName });
    await expect(hiddenCard.getByRole('heading', { name: serviceName })).toBeVisible();
    await expect(hiddenCard.getByText('隱藏')).toBeVisible();
  });
});

adminTest.describe('後台管理邊界與稽核', () => {
  // Edge case：批次產生時段第二次應有 skipped 計數。
  adminTest('admin 批次產生時段會跳過重複', async ({ request, runId, adminSession }) => {
    const serviceName = `E2E Bulk ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);

    const bulkTuesday = '2099-01-06';
    const bulkWeekday = new Date(`${bulkTuesday}T00:00:00Z`).getUTCDay() || 7;
    const payload = {
      serviceId,
      timezone: 'Asia/Taipei' as const,
      dateFrom: bulkTuesday,
      dateTo: bulkTuesday,
      weekdays: [bulkWeekday === 0 ? 7 : bulkWeekday],
      timeRanges: [{ startTime: '10:00', endTime: '12:00' }],
    };

    const first = await bulkGenerateAdminAvailabilitySlots(request, adminSession.token, payload);
    expect(first.created).toBeGreaterThan(0);

    const second = await bulkGenerateAdminAvailabilitySlots(request, adminSession.token, payload);
    expect(second.skipped).toBeGreaterThanOrEqual(1);
  });

  // Edge case：服務改為 hidden 後，公開列表不再出現。
  adminTest('admin 將服務改為 hidden 後公開列表不顯示', async ({ adminPage, page, request, runId, adminSession }) => {
    const serviceName = `E2E Hidden Public ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);

    await updateAdminService(request, adminSession.token, serviceId, { status: 'hidden' });

    await adminPage.goto('/admin/services');
    await expect(adminPage.locator('section').filter({ hasText: serviceName }).getByText('隱藏')).toBeVisible();

    await page.goto('/services');
    await expect(page.getByText(serviceName)).toHaveCount(0);
  });

  // 反向流程：admin 不可替 inactive 服務建立新時段。
  adminTest('admin 替 inactive 服務建立時段被拒絕', async ({ request, runId, adminSession }) => {
    const serviceName = `E2E Inactive Slot ${runId}`;
    const response = await request.post(`${API_BASE_URL}/api/admin/services`, {
      headers: {
        Cookie: sessionCookieHeader(adminSession.token, 'admin'),
      },
      data: {
        name: serviceName,
        durationMinutes: 60,
        price: 500,
        status: 'inactive',
      },
    });
    expect(response.status()).toBe(201);
    const serviceId = ((await response.json()) as { data: { id: string } }).data.id;

    const slotResponse = await tryCreateAdminAvailabilitySlot(request, adminSession.token, serviceId, 10, 60);
    expect(slotResponse.status()).toBe(409);
    expect(await readApiErrorCode(slotResponse)).toBe('SERVICE_NOT_ACTIVE');
  });

  // 反向流程：admin 不可替 hidden 服務建立新時段。
  adminTest('admin 替 hidden 服務建立時段被拒絕', async ({ request, runId, adminSession }) => {
    const serviceName = `E2E Hidden Slot ${runId}`;
    const response = await request.post(`${API_BASE_URL}/api/admin/services`, {
      headers: {
        Cookie: sessionCookieHeader(adminSession.token, 'admin'),
      },
      data: {
        name: serviceName,
        durationMinutes: 60,
        price: 600,
        status: 'hidden',
      },
    });
    expect(response.status()).toBe(201);
    const serviceId = ((await response.json()) as { data: { id: string } }).data.id;

    const slotResponse = await tryCreateAdminAvailabilitySlot(request, adminSession.token, serviceId, 10, 60);
    expect(slotResponse.status()).toBe(409);
    expect(await readApiErrorCode(slotResponse)).toBe('SERVICE_NOT_ACTIVE');
  });

  // 反向流程：admin 取消 completed 預約回 BOOKING_NOT_CANCELABLE。
  adminTest('admin 取消 completed 預約被拒絕', async ({ request, runId, adminSession }) => {
    const memberEmail = `e2e-admin-completed-member-${runId}@example.com`;
    const member = await registerAndLogin(request, memberEmail, 'Completed Member');

    const serviceName = `E2E Completed Cancel ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);
    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, -3, 60);
    const bookingId = await createAdminBooking(request, adminSession.token, member.userId, slotId);

    const cancelResponse = await cancelAdminBooking(request, adminSession.token, bookingId);
    expect(cancelResponse.status()).toBe(409);
    expect(await readApiErrorCode(cancelResponse)).toBe('BOOKING_NOT_CANCELABLE');
  });

  // Edge case：稽核紀錄頁可查到服務建立操作。
  adminTest('admin 建立服務後稽核紀錄可查詢', async ({ adminPage, request, runId, adminSession }) => {
    const serviceName = `E2E Audit ${runId}`;
    await createAdminService(request, adminSession.token, serviceName);

    await adminPage.goto('/admin/audit-logs');

    const auditCard = adminPage.locator('section').filter({ hasText: 'admin.service.create' }).first();
    await expect(auditCard).toBeVisible();
  });
});
