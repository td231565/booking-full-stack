import { expect, test } from '@playwright/test';
import {
  createAdminService,
  ensurePublicAvailabilitySlot,
  findHiddenServiceIdFromDb,
  findInactiveServiceIdFromDb,
  findPublicServiceIdByName,
  promoteUserToAdmin,
  registerAndLogin,
} from '../helpers/api';
import { SEED_SERVICE_NAMES } from '../helpers/constants';

test.describe('公開服務瀏覽', () => {
  // Happy path：訪客可瀏覽服務列表與 active 服務詳情。
  test('訪客可瀏覽服務列表與 active 服務詳情', async ({ page }) => {
    await page.goto('/services');

    await expect(page.getByRole('heading', { name: '服務列表' })).toBeVisible();
    await expect(page.getByRole('heading', { name: SEED_SERVICE_NAMES.active })).toBeVisible();
    await expect(page.getByRole('heading', { name: SEED_SERVICE_NAMES.inactive })).toBeVisible();

    await page
      .locator('.service-card')
      .filter({ hasText: SEED_SERVICE_NAMES.active })
      .getByRole('link', { name: '查看詳情' })
      .click();

    await expect(page.getByRole('heading', { name: SEED_SERVICE_NAMES.active })).toBeVisible();
    await expect(page.getByRole('heading', { name: '可預約時段' })).toBeVisible();
  });

  // Happy path：hidden 服務不出現在公開列表（對應 verification checklist Phase 3）。
  test('hidden 服務不出現在公開列表', async ({ page }) => {
    await page.goto('/services');

    await expect(page.getByText(SEED_SERVICE_NAMES.hidden)).toHaveCount(0);
  });

  // Happy path：inactive 服務顯示不可預約，且不顯示可預約時段區塊。
  test('inactive 服務顯示暫停預約且無可預約時段', async ({ page }) => {
    await page.goto('/services');

    const inactiveCard = page.locator('.service-card').filter({ hasText: SEED_SERVICE_NAMES.inactive });
    await expect(inactiveCard.getByText('暫停預約')).toBeVisible();

    await inactiveCard.getByRole('link', { name: '查看詳情' }).click();

    await expect(page.getByText('此服務目前暫停預約，仍可查看服務內容。')).toBeVisible();
    await expect(page.getByRole('heading', { name: '目前不可預約' })).toBeVisible();
  });

  // Edge case：active 服務若無可用時段，顯示 empty state（seed 的 blocked 時段不應出現）。
  test('公開可預約時段僅顯示 available 且符合 1 小時規則的 slot', async ({ page, request }) => {
    const runId = Date.now();
    const serviceId = await findPublicServiceIdByName(request, SEED_SERVICE_NAMES.active);
    expect(serviceId).toBeTruthy();

    await ensurePublicAvailabilitySlot(request, serviceId!, `public-slot-${runId}`);

    await page.goto(`/services/${serviceId}`);

    const slotArticles = page.locator('.slot-list .slot');
    const slotCount = await slotArticles.count();

    expect(slotCount).toBeGreaterThan(0);

    for (let index = 0; index < slotCount; index += 1) {
      await expect(slotArticles.nth(index).getByRole('button', { name: '預約' })).toBeVisible();
    }
  });

  // 反向流程：hidden 服務詳情 URL 應顯示 404。
  test('直接開啟 hidden 服務詳情會顯示找不到頁面', async ({ page }) => {
    const hiddenServiceId = findHiddenServiceIdFromDb();

    await page.goto(`/services/${hiddenServiceId}`);

    await expect(page.getByText(/404|找不到|not found/i)).toBeVisible();
  });

  // 反向流程：不存在的 serviceId 應顯示 404。
  test('不存在的服務詳情會顯示找不到頁面', async ({ page }) => {
    await page.goto('/services/00000000-0000-4000-8000-000000000001');

    await expect(page.getByText(/404|找不到|not found/i)).toBeVisible();
  });

  // Edge case：直接以 URL 進入 inactive 服務詳情，應可查看但不可預約（非 404）。
  test('直接開啟 inactive 服務詳情顯示不可預約', async ({ page }) => {
    const inactiveServiceId = findInactiveServiceIdFromDb();

    await page.goto(`/services/${inactiveServiceId}`);

    await expect(page.getByRole('heading', { name: SEED_SERVICE_NAMES.inactive })).toBeVisible();
    await expect(page.getByText('此服務目前暫停預約，仍可查看服務內容。')).toBeVisible();
    await expect(page.getByRole('heading', { name: '目前不可預約' })).toBeVisible();
    await expect(page.getByRole('button', { name: '預約' })).toHaveCount(0);
  });

  // Edge case：active 服務目前無任何可用時段時顯示 empty state。
  test('active 服務無可用時段時顯示 empty state', async ({ page, request }) => {
    const runId = Date.now();
    const adminEmail = `e2e-empty-admin-${runId}@example.com`;
    const adminSession = await registerAndLogin(request, adminEmail, 'Empty Admin');
    promoteUserToAdmin(adminEmail);

    const serviceName = `E2E 無時段服務 ${runId}`;
    const serviceId = await createAdminService(request, adminSession.token, serviceName);

    await page.goto(`/services/${serviceId}`);

    await expect(page.getByRole('heading', { name: serviceName })).toBeVisible();
    await expect(page.getByRole('heading', { name: '目前沒有可預約時段' })).toBeVisible();
    await expect(page.getByText('請稍後再回來查看。')).toBeVisible();
    await expect(page.getByRole('button', { name: '預約' })).toHaveCount(0);
  });
});
