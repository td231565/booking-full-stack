import { defineConfig, devices } from '@playwright/test';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const webBaseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';

// Playwright E2E 設定：同時啟動 API 與 Web，覆蓋公開瀏覽與會員預約流程。
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'bash scripts/e2e-start-api.sh',
      url: `${apiBaseUrl}/api/services`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'bash scripts/e2e-start-web.sh',
      url: webBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
