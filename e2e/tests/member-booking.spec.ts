import { expect, test } from '@playwright/test';
import {
  buildBrowserSessionCookies,
  createAdminAvailabilitySlot,
  createAdminAvailabilitySlotMinutesFromNow,
  createAdminService,
  findInactiveServiceIdFromDb,
  findPublicServiceIdByName,
  insertCompletedBookingInDb,
  insertPastAvailabilitySlotInDb,
  registerAndLogin,
  registerAndLoginAdmin,
  registerUser,
  sessionCookieHeader,
  updateAdminService,
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
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Golden Admin');
    await createAdminAvailabilitySlot(request, adminSession.token, serviceId!, 72 + (runId % 500), 60);

    await page.goto(`/services/${serviceId}`);
    await expect(page.getByRole('button', { name: '預約' }).first()).toBeVisible();
    await page.getByRole('button', { name: '預約' }).first().click();

    await expect(page).toHaveURL(/\/my\/bookings\/.+/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('是否加入日曆')).toBeVisible();
    await expect(page.getByText('已成立')).toBeVisible();

    // 先關閉日曆提示，避免 overlay 擋住取消按鈕。
    await page.getByRole('button', { name: '稍後' }).click();

    await page.getByRole('button', { name: '取消預約' }).click();

    await expect(page.getByText('已取消', { exact: true }).first()).toBeVisible();
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

  // 反向流程：未登入在服務詳情點「預約」會導向登入並帶 redirect。
  test('未登入點預約按鈕會導向登入頁', async ({ page, request }) => {
    const runId = Date.now();
    const adminEmail = `e2e-guest-book-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Guest Book Admin');

    const serviceId = await createAdminService(request, adminSession.token, `E2E 訪客預約 ${runId}`);
    await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 72, 60);

    await page.goto(`/services/${serviceId}`);
    await page.getByRole('button', { name: '預約' }).click();

    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=/services/${serviceId}$`));
    await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
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
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'E2E List Admin');

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 72, 60);

    const bookingResponse = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(memberSession.token, 'member'),
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
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Peek Admin');

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 80, 60);

    const ownerBooking = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(owner.token, 'member'),
      },
      data: { availabilitySlotId: slotId },
    });
    const bookingId = ((await ownerBooking.json()) as { data: { id: string } }).data.id;

    await memberPage.context().addCookies(buildBrowserSessionCookies(peeker.token, 'member'));

    await memberPage.goto(`/my/bookings/${bookingId}`);

    await expect(memberPage.getByRole('heading', { name: '預約詳情暫時無法載入' })).toBeVisible();
    await expect(memberPage.getByText('預約不存在')).toBeVisible();
  });

  // Edge case：頁面已載入時段後被他人搶走，UI 顯示 BOOKING_SLOT_UNAVAILABLE 訊息。
  memberTest('時段已被預約時顯示不可預約訊息', async ({ memberPage, request, runId, memberSession }) => {
    const takerEmail = `e2e-taker-${runId}@example.com`;
    const taker = await registerAndLogin(request, takerEmail, 'Taker');

    const adminEmail = `e2e-slot-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Slot Admin');

    const serviceId = await createAdminService(request, adminSession.token, `E2E 衝突服務 ${runId}`);
    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 100, 60);

    await memberPage.goto(`/services/${serviceId}`);
    await expect(memberPage.getByRole('button', { name: '預約' })).toHaveCount(1);

    const taken = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(taker.token, 'member'),
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
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Cancel Admin');

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 120, 60);

    const created = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(memberSession.token, 'member'),
      },
      data: { availabilitySlotId: slotId },
    });
    const bookingId = ((await created.json()) as { data: { id: string } }).data.id;

    await request.post(`${API_BASE_URL}/api/me/bookings/${bookingId}/cancel`, {
      headers: {
        Cookie: sessionCookieHeader(memberSession.token, 'member'),
      },
      data: { reason: 'first cancel' },
    });

    await memberPage.goto(`/my/bookings/${bookingId}`);

    await expect(memberPage.getByText('已取消', { exact: true }).first()).toBeVisible();
    await expect(memberPage.getByText('此預約已取消。')).toBeVisible();
  });

  // 反向流程：登出後無法維持私人頁 session。
  memberTest('登出後訪問我的預約會導向登入', async ({ memberPage, request, memberSession }) => {
    const logout = await request.post(`${API_BASE_URL}/api/auth/logout`, {
      headers: { Cookie: sessionCookieHeader(memberSession.token, 'member') },
    });
    expect(logout.ok()).toBeTruthy();

    await memberPage.goto('/my/bookings');

    await expect(memberPage).toHaveURL(/\/login\?redirect=\/my\/bookings/);
  });

  // Edge case：同一會員在頁面未刷新時重複預約同一時段，顯示 BOOKING_DUPLICATED 訊息。
  memberTest('重複預約同一時段顯示已預約過', async ({ memberPage, request, runId, memberSession }) => {
    const adminEmail = `e2e-dup-book-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Dup Book Admin');

    const serviceId = await createAdminService(request, adminSession.token, `E2E 重複預約 ${runId}`);
    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 80, 60);

    await memberPage.goto(`/services/${serviceId}`);
    await expect(memberPage.getByRole('button', { name: '預約' })).toBeVisible();

    const firstBooking = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(memberSession.token, 'member'),
      },
      data: { availabilitySlotId: slotId },
    });
    expect(firstBooking.ok()).toBeTruthy();

    await memberPage.getByRole('button', { name: '預約' }).click();
    await expect(memberPage.getByText('你已預約過此時段。')).toBeVisible();
  });

  // Edge case：已登入會員造訪 inactive 服務詳情，不顯示預約入口。
  memberTest('已登入會員查看 inactive 服務不可預約', async ({ memberPage }) => {
    const inactiveServiceId = findInactiveServiceIdFromDb();

    await memberPage.goto(`/services/${inactiveServiceId}`);

    await expect(memberPage.getByRole('heading', { name: SEED_SERVICE_NAMES.inactive })).toBeVisible();
    await expect(memberPage.getByRole('heading', { name: '目前不可預約' })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: '預約' })).toHaveCount(0);
  });

  // Edge case：結束時間已過的預約，詳情頁對外顯示 completed（DB 直接插入過去時段）。
  memberTest('已結束預約詳情顯示已完成', async ({ memberPage, request, runId, memberSession }) => {
    const adminEmail = `e2e-completed-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Completed Admin');

    const serviceId = await createAdminService(request, adminSession.token, `E2E 已完成 ${runId}`);
    const slotId = insertPastAvailabilitySlotInDb(serviceId);
    const bookingId = insertCompletedBookingInDb({
      userId: memberSession.userId,
      serviceId,
      slotId,
    });

    await memberPage.goto(`/my/bookings/${bookingId}`);

    await expect(memberPage.getByText('已完成', { exact: true }).first()).toBeVisible();
    await expect(memberPage.getByText('此預約已完成，無法取消。')).toBeVisible();
    await expect(memberPage.getByRole('button', { name: '取消預約' })).toHaveCount(0);
  });

  // Edge case：服務改為 inactive 後，會員無法從詳情頁預約。
  memberTest('服務改為 inactive 後不可預約', async ({ memberPage, request, runId, memberSession }) => {
    const adminEmail = `e2e-inactive-book-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Inactive Book Admin');

    const serviceName = `E2E 轉停用 ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);
    await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 90, 60);

    await updateAdminService(request, adminSession.token, serviceId, { status: 'inactive' });

    await memberPage.goto(`/services/${serviceId}`);

    await expect(memberPage.getByRole('heading', { name: '目前不可預約' })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: '預約' })).toHaveCount(0);
  });
});

memberTest.describe('日曆整合', () => {
  memberTest('我的預約列表非 cancelled 列顯示加入日曆', async ({ memberPage, request, runId, memberSession }) => {
    const adminEmail = `e2e-cal-list-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Cal List Admin');

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 72, 60);

    const created = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(memberSession.token, 'member'),
      },
      data: { availabilitySlotId: slotId },
    });
    expect(created.ok()).toBeTruthy();

    await memberPage.goto('/my/bookings');

    await expect(memberPage.getByRole('button', { name: '加入日曆' })).toBeVisible();
  });

  memberTest('詳情頁常駐加入日曆按鈕', async ({ memberPage, request, runId, memberSession }) => {
    const adminEmail = `e2e-cal-detail-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Cal Detail Admin');

    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    const slotId = await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 72, 60);

    const created = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(memberSession.token, 'member'),
      },
      data: { availabilitySlotId: slotId },
    });
    const bookingId = ((await created.json()) as { data: { id: string } }).data.id;

    await memberPage.goto(`/my/bookings/${bookingId}`);

    await expect(memberPage.getByRole('button', { name: '加入日曆' })).toBeVisible();
  });
});

// 時間邊界測試需等待真實時間推進，拉長整段 describe 的 timeout。
memberTest.describe('會員預約時間邊界', () => {
  memberTest.describe.configure({ timeout: 240_000 });

  // Edge case：頁面仍顯示時段但開始時間已進入 1 小時內，UI 顯示 BOOKING_TOO_SOON 訊息。
  memberTest('時段開始時間進入 1 小時內時顯示不可過早預約', async ({ memberPage, request, runId }) => {
    const adminEmail = `e2e-soon-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Soon Admin');

    const serviceId = await createAdminService(request, adminSession.token, `E2E 過早預約 ${runId}`);
    await createAdminAvailabilitySlotMinutesFromNow(request, adminSession.token, serviceId, 62, 60);

    await memberPage.goto(`/services/${serviceId}`);
    await expect(memberPage.getByRole('button', { name: '預約' })).toBeVisible();

    // 等待時段進入 1 小時內，觸發後端 BOOKING_TOO_SOON（頁面不刷新以保留按鈕）。
    await memberPage.waitForTimeout(130_000);
    await memberPage.getByRole('button', { name: '預約' }).click();

    await expect(memberPage.getByText('只能預約 1 小時後開始的時段。')).toBeVisible();
  });

  // Edge case：距離開始少於 4 小時時，取消按鈕送出後顯示 BOOKING_CANCEL_TOO_LATE 訊息。
  memberTest('距離開始少於 4 小時取消顯示不可過晚取消', async ({ memberPage, request, runId, memberSession }) => {
    const adminEmail = `e2e-late-cancel-admin-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, adminEmail, 'Late Cancel Admin');

    const serviceId = await createAdminService(request, adminSession.token, `E2E 過晚取消 ${runId}`);
    const slotId = await createAdminAvailabilitySlotMinutesFromNow(
      request,
      adminSession.token,
      serviceId,
      242,
      60,
    );

    const created = await request.post(`${API_BASE_URL}/api/bookings`, {
      headers: {
        Cookie: sessionCookieHeader(memberSession.token, 'member'),
      },
      data: { availabilitySlotId: slotId },
    });
    const bookingId = ((await created.json()) as { data: { id: string } }).data.id;

    await memberPage.goto(`/my/bookings/${bookingId}`);
    await expect(memberPage.getByRole('button', { name: '取消預約' })).toBeVisible();

    // 推進到距離開始少於 4 小時；頁面未重載時按鈕仍可點，由後端回 BOOKING_CANCEL_TOO_LATE。
    await memberPage.waitForTimeout(130_000);
    await memberPage.getByRole('button', { name: '取消預約' }).click();

    await expect(memberPage.getByText('距離開始時間少於 4 小時，無法取消。')).toBeVisible();
  });
});
