import { expect, test } from '@playwright/test';
import {
  createAdminAvailabilitySlot,
  createAdminService,
  findPublicServiceIdByName,
  promoteUserToAdmin,
  registerAndLogin,
  registerUser,
} from '../helpers/api';
import { API_BASE_URL, DEFAULT_PASSWORD, SEED_SERVICE_NAMES } from '../helpers/constants';
import { memberTest } from '../fixtures/auth';

test.describe('會員預約 golden path', () => {
  // 完整 UI 流程：註冊 → 登入 → 建立預約 → 取消（取代 verify-phase6 E2E 段落）。
  test('註冊登入後可建立並取消預約', async ({ page, request }) => {
    const runId = Date.now();
    const email = `e2e-flow-${runId}@example.com`;
    const password = DEFAULT_PASSWORD;

    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('顯示名稱').fill('E2E Flow');
    await page.getByLabel('密碼').fill(password);
    await page.getByRole('button', { name: '註冊' }).click();

    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('密碼').fill(password);
    await page.getByRole('button', { name: '登入' }).click();

    await expect(page).toHaveURL(/\/my\/bookings$/);
    await expect(page.getByRole('heading', { name: '我的預約' })).toBeVisible();

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const adminEmail = `e2e-golden-admin-${runId}@example.com`;
    const adminSession = await registerAndLogin(request, adminEmail, 'Golden Admin');
    promoteUserToAdmin(adminEmail);
    await createAdminAvailabilitySlot(request, adminSession.token, serviceId!, 72 + (runId % 500), 60);

    await page.goto(`/services/${serviceId}`);
    await expect(page.getByRole('button', { name: '預約' }).first()).toBeVisible();
    await page.getByRole('button', { name: '預約' }).first().click();

    await expect(page).toHaveURL(/\/my\/bookings\/.+/);
    await expect(page.getByText('狀態：已成立')).toBeVisible();

    await page.getByRole('button', { name: '取消預約' }).click();

    await expect(page.getByText('狀態：已取消')).toBeVisible();
    await expect(page.getByText('此預約已取消。')).toBeVisible();
  });
});

test.describe('會員認證與權限', () => {
  // 反向流程：未登入訪問私人頁會導向登入。
  test('未登入訪問我的預約會導向登入', async ({ page }) => {
    await page.goto('/my/bookings');

    await page.waitForURL('**/login?redirect=/my/bookings', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  });

  // 反向流程：重複 email 註冊顯示穩定錯誤訊息。
  test('重複 email 註冊顯示已被使用', async ({ page, request }) => {
    const runId = Date.now();
    const email = `e2e-dup-${runId}@example.com`;

    await registerUser(request, email, 'Dup User');

    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('顯示名稱').fill('Dup Again');
    await page.getByLabel('密碼').fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: '註冊' }).click();

    await expect(page.getByText('此 email 已被使用。')).toBeVisible();
  });

  // 反向流程：錯誤密碼登入顯示 INVALID_CREDENTIALS 對應訊息。
  test('錯誤密碼登入顯示帳號或密碼錯誤', async ({ page, request }) => {
    const runId = Date.now();
    const email = `e2e-wrong-pass-${runId}@example.com`;

    await registerUser(request, email, 'Wrong Pass');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('密碼').fill('wrong-password-99');
    await page.getByRole('button', { name: '登入' }).click();

    await expect(page.getByText('帳號或密碼錯誤。')).toBeVisible();
  });
});

memberTest.describe('會員預約邊界與反向流程', () => {
  // Happy path：我的預約列表可看到剛建立的預約。
  memberTest('建立預約後可在我的預約列表看到紀錄', async ({
    memberPage,
    request,
    runId,
    memberSession,
  }) => {
    const adminEmail = `e2e-list-admin-${runId}@example.com`;
    const adminSession = await registerAndLogin(request, adminEmail, 'E2E List Admin');
    const { promoteUserToAdmin } = await import('../helpers/api');
    promoteUserToAdmin(adminEmail);

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 72, 60);

    const bookingResponse = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: `booking_session=${encodeURIComponent(memberSession.token)}`,
      },
      data: { availabilitySlotId: slotId, note: 'e2e list' },
    });
    expect(bookingResponse.ok()).toBeTruthy();

    const bookingBody = (await bookingResponse.json()) as { data: { id: string } };

    await memberPage.goto('/my/bookings');

    await expect(memberPage.getByText(SEED_SERVICE_NAMES.active)).toBeVisible();
    await expect(memberPage.getByRole('link', { name: '查看' })).toBeVisible();

    await memberPage.getByRole('link', { name: '查看' }).click();
    await expect(memberPage).toHaveURL(new RegExp(`/my/bookings/${bookingBody.data.id}$`));
  });

  // 反向流程：不可查看他人預約詳情。
  memberTest('無法查看他人預約詳情', async ({ memberPage, request, runId }) => {
    const ownerEmail = `e2e-owner-${runId}@example.com`;
    const peekerEmail = `e2e-peeker-${runId}@example.com`;

    const owner = await registerAndLogin(request, ownerEmail, 'Owner');
    const peeker = await registerAndLogin(request, peekerEmail, 'Peeker');

    const adminEmail = `e2e-peek-admin-${runId}@example.com`;
    const adminSession = await registerAndLogin(request, adminEmail, 'Peek Admin');
    const { promoteUserToAdmin } = await import('../helpers/api');
    promoteUserToAdmin(adminEmail);

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 80, 60);

    const ownerBooking = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: `booking_session=${encodeURIComponent(owner.token)}`,
      },
      data: { availabilitySlotId: slotId },
    });
    const bookingId = ((await ownerBooking.json()) as { data: { id: string } }).data.id;

    await memberPage.context().addCookies([
      {
        name: 'booking_session',
        value: peeker.token,
        url: API_BASE_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await memberPage.goto(`/my/bookings/${bookingId}`);

    await expect(memberPage.getByRole('heading', { name: '預約詳情暫時無法載入' })).toBeVisible();
    await expect(memberPage.getByText('預約不存在')).toBeVisible();
  });

  // Edge case：頁面已載入時段後被他人搶走，UI 顯示 BOOKING_SLOT_UNAVAILABLE 訊息。
  memberTest('時段已被預約時顯示不可預約訊息', async ({ memberPage, request, runId, memberSession }) => {
    const takerEmail = `e2e-taker-${runId}@example.com`;
    const taker = await registerAndLogin(request, takerEmail, 'Taker');

    const adminEmail = `e2e-slot-admin-${runId}@example.com`;
    const adminSession = await registerAndLogin(request, adminEmail, 'Slot Admin');
    const { promoteUserToAdmin } = await import('../helpers/api');
    promoteUserToAdmin(adminEmail);

    const serviceId = await createAdminService(request, adminSession.token, `E2E 衝突服務 ${runId}`);
    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 100, 60);

    await memberPage.context().addCookies([
      {
        name: 'booking_session',
        value: memberSession.token,
        url: API_BASE_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await memberPage.goto(`/services/${serviceId}`);
    await expect(memberPage.getByRole('button', { name: '預約' })).toHaveCount(1);

    const taken = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: `booking_session=${encodeURIComponent(taker.token)}`,
      },
      data: { availabilitySlotId: slotId },
    });
    expect(taken.ok()).toBeTruthy();

    await memberPage.getByRole('button', { name: '預約' }).click();

    await expect(memberPage.getByText('此時段目前不可預約，請重新整理後選擇其他時段。')).toBeVisible();
  });

  // Edge case：已取消預約再次取消顯示 BOOKING_NOT_CANCELABLE 對應訊息。
  memberTest('已取消預約再次取消顯示不可取消', async ({ memberPage, request, runId, memberSession }) => {
    const adminEmail = `e2e-cancel-admin-${runId}@example.com`;
    const adminSession = await registerAndLogin(request, adminEmail, 'Cancel Admin');
    const { promoteUserToAdmin } = await import('../helpers/api');
    promoteUserToAdmin(adminEmail);

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 120, 60);

    const created = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: `booking_session=${encodeURIComponent(memberSession.token)}`,
      },
      data: { availabilitySlotId: slotId },
    });
    const bookingId = ((await created.json()) as { data: { id: string } }).data.id;

    await request.post(`${API_BASE_URL}/api/me/bookings/${bookingId}/cancel`, {
      headers: {
        Cookie: `booking_session=${encodeURIComponent(memberSession.token)}`,
      },
      data: { reason: 'first cancel' },
    });

    await memberPage.goto(`/my/bookings/${bookingId}`);

    await expect(memberPage.getByText('狀態：已取消')).toBeVisible();
    await expect(memberPage.getByText('此預約已取消。')).toBeVisible();
  });

  // 反向流程：登出後無法維持私人頁 session。
  memberTest('登出後訪問我的預約會導向登入', async ({ memberPage, request, memberSession }) => {
    const logout = await request.post(`${API_BASE_URL}/api/auth/logout`, {
      headers: {
        Cookie: `booking_session=${encodeURIComponent(memberSession.token)}`,
      },
    });
    expect(logout.ok()).toBeTruthy();

    await memberPage.goto('/my/bookings');

    await expect(memberPage).toHaveURL(/\/login\?redirect=\/my\/bookings/);
  });
});
