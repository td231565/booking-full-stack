import {
  buildBrowserSessionCookies,
  loginAdminUser,
  promoteUserToAdmin,
  registerAndLogin,
  registerAndLoginAdmin,
} from '../helpers/api';
import { expect, test } from '../fixtures/auth';

test.describe('前台／後台 session 隔離', () => {
  // E2E-03：admin 帳號僅 member 登入時，無法進入後台 dashboard。
  test('admin 僅 member 登入時訪問後台預約管理會導向後台登入', async ({ page, request, runId }) => {
    const email = `e2e-iso-member-only-${runId}@example.com`;
    const memberSession = await registerAndLogin(request, email, 'Iso Admin Member');
    promoteUserToAdmin(email);

    await page.context().addCookies(buildBrowserSessionCookies(memberSession.token, 'member'));

    await page.goto('/admin/bookings');

    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: '後台管理系統' })).toBeVisible();
  });

  // E2E-04：僅 admin session 時，前台私人頁會導向前台登入。
  test('僅後台登入時訪問我的預約會導向前台登入', async ({ page, request, runId }) => {
    const email = `e2e-iso-admin-only-${runId}@example.com`;
    const adminSession = await registerAndLoginAdmin(request, email, 'Iso Admin Only');

    await page.context().addCookies(buildBrowserSessionCookies(adminSession.token, 'admin'));

    await page.goto('/my/bookings');

    await page.waitForURL('**/login?redirect=/my/bookings', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
  });

  // 補充：admin 帳號同時持有 member 與 admin session 時，兩邊私人頁皆可進入。
  test('admin 同時登入前後台時可進入我的預約與後台預約管理', async ({ page, request, runId }) => {
    const email = `e2e-iso-dual-${runId}@example.com`;
    const memberSession = await registerAndLogin(request, email, 'Iso Dual');
    promoteUserToAdmin(email);
    const adminSession = await loginAdminUser(request, email);

    await page.context().addCookies([
      ...buildBrowserSessionCookies(memberSession.token, 'member'),
      ...buildBrowserSessionCookies(adminSession.token, 'admin'),
    ]);

    await page.goto('/my/bookings');
    await expect(page.getByRole('heading', { name: '我的預約' })).toBeVisible();

    await page.goto('/admin/bookings');
    await expect(page.locator('main').getByRole('heading', { name: '預約管理' })).toBeVisible();
  });
});
