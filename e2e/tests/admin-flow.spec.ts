import { expect } from '@playwright/test';
import { API_BASE_URL } from '../helpers/constants';
import { promoteUserToAdmin, registerAndLogin } from '../helpers/api';
import { SEED_SERVICE_NAMES } from '../helpers/constants';
import { adminTest, test } from '../fixtures/auth';

test.describe('後台權限', () => {
  // 反向流程：一般會員訪問後台頁面顯示無權限（verification checklist Phase 6）。
  test('非 admin 訪問後台服務管理顯示無權限', async ({ page, request, runId }) => {
    const email = `e2e-member-admin-${runId}@example.com`;
    const session = await registerAndLogin(request, email, 'Member No Admin');

    await page.context().addCookies([
      {
        name: 'booking_session',
        value: session.token,
        url: API_BASE_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    await page.goto('/admin/services');

    await expect(page.getByText('你沒有後台管理權限。')).toBeVisible();
  });

  // 反向流程：未登入訪問後台會因 API 401 而無法載入資料。
  test('未登入訪問後台服務管理顯示載入失敗', async ({ page }) => {
    await page.goto('/admin/services');

    await expect(page.getByRole('heading', { name: '服務管理資料無法載入' })).toBeVisible();
    await expect(page.getByText('尚未登入')).toBeVisible();
  });
});

adminTest.describe('後台管理 golden path', () => {
  // Happy path：admin 可查看含 hidden 的服務列表。
  adminTest('admin 可查看 hidden 服務', async ({ adminPage }) => {
    await adminPage.goto('/admin/services');

    await expect(adminPage.getByRole('heading', { name: '服務管理' })).toBeVisible();
    const hiddenCard = adminPage.locator('.card').filter({ hasText: SEED_SERVICE_NAMES.hidden });
    await expect(hiddenCard.getByRole('heading', { name: SEED_SERVICE_NAMES.hidden })).toBeVisible();
    await expect(hiddenCard.getByText('狀態：隱藏')).toBeVisible();
  });

  // Happy path：admin 後台首頁可進入各管理區塊。
  adminTest('admin 可進入後台首頁導覽', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(adminPage.getByRole('heading', { name: '後台管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '服務管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '時段管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '預約管理' })).toBeVisible();
    await expect(adminPage.getByRole('link', { name: '稽核紀錄' })).toBeVisible();
  });
});
