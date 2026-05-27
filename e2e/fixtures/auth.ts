import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { registerAndLogin, registerAndLoginAdmin, type AuthSession } from '../helpers/api';
import {
  ADMIN_SESSION_COOKIE_NAME,
  API_BASE_URL,
  MEMBER_SESSION_COOKIE_NAME,
} from '../helpers/constants';

type RunIdFixture = {
  runId: number;
};

type MemberAuthFixtures = {
  memberSession: AuthSession;
  memberContext: BrowserContext;
  memberPage: Page;
};

type AdminAuthFixtures = {
  adminSession: AuthSession;
  adminContext: BrowserContext;
  adminPage: Page;
};

type SessionAudience = 'member' | 'admin';

// 將 API session cookie 注入瀏覽器，讓前端 cross-origin fetch 能帶 credentials。
async function applySessionCookie(
  context: BrowserContext,
  token: string,
  audience: SessionAudience,
): Promise<void> {
  const cookieName =
    audience === 'admin' ? ADMIN_SESSION_COOKIE_NAME : MEMBER_SESSION_COOKIE_NAME;

  await context.addCookies([
    {
      name: cookieName,
      value: token,
      url: API_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export const test = base.extend<RunIdFixture>({
  runId: async ({}, use) => {
    await use(Date.now());
  },
});

// 已登入會員的瀏覽器頁面，供權限與私人頁測試使用。
export const memberTest = test.extend<MemberAuthFixtures>({
  memberSession: async ({ request, runId }, use) => {
    const email = `e2e-member-${runId}@example.com`;
    const session = await registerAndLogin(request, email, 'E2E Member');
    await use(session);
  },

  memberContext: async ({ browser, memberSession }, use) => {
    const context = await browser.newContext();
    await applySessionCookie(context, memberSession.token, 'member');
    await use(context);
    await context.close();
  },

  memberPage: async ({ memberContext }, use) => {
    const page = await memberContext.newPage();
    await use(page);
    await page.close();
  },
});

// 已登入管理員的瀏覽器頁面，供後台 E2E 使用。
export const adminTest = test.extend<AdminAuthFixtures>({
  adminSession: async ({ request, runId }, use) => {
    const email = `e2e-admin-${runId}@example.com`;
    const session = await registerAndLoginAdmin(request, email, 'E2E Admin');
    await use(session);
  },

  adminContext: async ({ browser, adminSession }, use) => {
    const context = await browser.newContext();
    await applySessionCookie(context, adminSession.token, 'admin');
    await use(context);
    await context.close();
  },

  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
