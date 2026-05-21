import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let container: PostgreSqlContainer | undefined;

// 啟動 PostgreSQL testcontainer、注入 DATABASE_URL，並執行 TypeORM migration。
export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();

  process.env.DATABASE_URL = databaseUrl;

  execSync('npm run migration:run', {
    cwd: apiRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  });
}

// 測試結束後停止 container，避免本機殘留 Docker 資源。
export async function teardown(): Promise<void> {
  await container?.stop();
}
