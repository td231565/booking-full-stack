import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Vitest 透過 SWC 編譯 NestJS 裝飾器，避免 ts-node 與 reflect-metadata 在測試環境失效。
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          setupFiles: ['./vitest.setup.ts'],
          include: ['test/**/*.e2e.spec.ts'],
          globalSetup: ['./test/setup/testcontainer.setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
