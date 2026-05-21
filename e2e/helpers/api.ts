import { execSync } from 'node:child_process';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { API_BASE_URL, DEFAULT_PASSWORD, SEED_SERVICE_NAMES, SESSION_COOKIE_NAME } from './constants';

export type AuthSession = {
  token: string;
  userId: string;
  email: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

// 依測試識別產生不同 IP，避免並行註冊觸發 register rate limit。
function buildForwardedIp(scope: string, key: string): string {
  const hash = [...`${scope}:${key}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return `10.${(hash % 200) + 10}.${(hash % 250) + 1}.1`;
}

// 執行 SQL 查詢並回傳純文字結果，供取得 seed hidden 服務 id 使用。
export function queryScalar(sql: string): string {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgres://booking_scheduler:booking_scheduler@localhost:5432/booking_scheduler';

  let runner: string;

  if (process.env.POSTGRES_CONTAINER) {
    runner = `docker exec ${process.env.POSTGRES_CONTAINER} psql -U booking_scheduler -d booking_scheduler -tAc`;
  } else {
    try {
      execSync('command -v psql', { encoding: 'utf8', stdio: 'pipe' });
      runner = `psql "${databaseUrl}" -tAc`;
    } catch {
      runner = 'docker exec full-stack-postgres-1 psql -U booking_scheduler -d booking_scheduler -tAc';
    }
  }

  return execSync(`${runner} ${JSON.stringify(sql)}`, { encoding: 'utf8' }).trim();
}

// 從 DB 取得 hidden 服務 id，避免 hidden 404 測試再額外註冊 admin。
export function findHiddenServiceIdFromDb(): string {
  const serviceId = queryScalar(
    `SELECT id::text FROM services WHERE name = '${SEED_SERVICE_NAMES.hidden.replace(/'/g, "''")}' LIMIT 1`,
  );

  if (!serviceId) {
    throw new Error(`seed hidden service not found: ${SEED_SERVICE_NAMES.hidden}`);
  }

  return serviceId;
}

// 從 login 回應解析 booking_session cookie，供瀏覽器 context 帶入跨域 API 請求。
export function parseSessionToken(response: APIResponse): string | null {
  const cookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);

  const target = cookies.find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!target) {
    return null;
  }

  return decodeURIComponent(target.split(';')[0].slice(SESSION_COOKIE_NAME.length + 1));
}

// 註冊新會員；每個測試使用唯一 email 避免與其他案例衝突。
export async function registerUser(
  request: APIRequestContext,
  email: string,
  displayName: string,
  password = DEFAULT_PASSWORD,
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/auth/register`, {
    headers: {
      'X-Forwarded-For': buildForwardedIp('register', email),
    },
    data: { email, password, displayName },
  });

  if (response.status() !== 200 && response.status() !== 201) {
    throw new Error(`register failed: ${response.status()} ${await response.text()}`);
  }
}

// 登入並回傳 session token 與 user id。
export async function loginUser(
  request: APIRequestContext,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<AuthSession> {
  const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
    headers: {
      'X-Forwarded-For': buildForwardedIp('login', email),
    },
    data: { email, password },
  });

  if (response.status() !== 200) {
    throw new Error(`login failed: ${response.status()} ${await response.text()}`);
  }

  const token = parseSessionToken(response);

  if (!token) {
    throw new Error(`missing session cookie for ${email}`);
  }

  const body = (await response.json()) as { data: { id: string; email: string } };

  return {
    token,
    userId: body.data.id,
    email: body.data.email,
  };
}

// 註冊並登入，回傳可用於後續 Member / Admin API 的 session。
export async function registerAndLogin(
  request: APIRequestContext,
  email: string,
  displayName: string,
  password = DEFAULT_PASSWORD,
): Promise<AuthSession> {
  await registerUser(request, email, displayName, password);
  return loginUser(request, email, password);
}

// 將指定 email 升級為 admin，對應 verification checklist 的後台權限需求。
export function promoteUserToAdmin(email: string): void {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgres://booking_scheduler:booking_scheduler@localhost:5432/booking_scheduler';
  const safeEmail = email.replace(/'/g, "''");

  let runner: string;

  if (process.env.POSTGRES_CONTAINER) {
    runner = `docker exec ${process.env.POSTGRES_CONTAINER} psql -U booking_scheduler -d booking_scheduler -tAc`;
  } else {
    try {
      execSync('command -v psql', { encoding: 'utf8', stdio: 'pipe' });
      runner = `psql "${databaseUrl}" -tAc`;
    } catch {
      runner = 'docker exec full-stack-postgres-1 psql -U booking_scheduler -d booking_scheduler -tAc';
    }
  }

  execSync(`${runner} ${JSON.stringify(`UPDATE users SET role = 'admin' WHERE email = '${safeEmail}'`)}`, {
    encoding: 'utf8',
  });
}

// 以 admin 身分建立 active 服務，供衝突情境測試使用（公開列表僅此一服務的時段）。
export async function createAdminService(
  request: APIRequestContext,
  adminToken: string,
  name: string,
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/admin/services`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(adminToken)}`,
    },
    data: {
      name,
      durationMinutes: 60,
      price: 1000,
      status: 'active',
    },
  });

  if (response.status() !== 200 && response.status() !== 201) {
    throw new Error(`create service failed: ${response.status()} ${await response.text()}`);
  }

  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

// 以 admin 身分建立可預約時段，確保會員預約測試有獨立 slot。
export async function createAdminAvailabilitySlot(
  request: APIRequestContext,
  adminToken: string,
  serviceId: string,
  hoursFromNow: number,
  durationMinutes: number,
): Promise<string> {
  const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const response = await request.post(`${API_BASE_URL}/api/admin/availability-slots`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(adminToken)}`,
    },
    data: {
      serviceId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: 'available',
    },
  });

  if (response.status() !== 200 && response.status() !== 201) {
    throw new Error(`create slot failed: ${response.status()} ${await response.text()}`);
  }

  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

// 查詢公開服務列表並依名稱取得 service id。
export async function findPublicServiceIdByName(
  request: APIRequestContext,
  name: string,
): Promise<string | null> {
  const response = await request.get(`${API_BASE_URL}/api/services?page=1&pageSize=50`);

  if (response.status() !== 200) {
    throw new Error(`list services failed: ${response.status()}`);
  }

  const body = (await response.json()) as {
    data: Array<{ id: string; name: string }>;
  };

  return body.data.find((service) => service.name === name)?.id ?? null;
}

// 查詢後台服務列表並依名稱取得 service id（含 hidden）。
export async function findAdminServiceIdByName(
  request: APIRequestContext,
  adminToken: string,
  name: string,
): Promise<string | null> {
  const response = await request.get(`${API_BASE_URL}/api/admin/services?page=1&pageSize=50`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(adminToken)}`,
    },
  });

  if (response.status() !== 200) {
    throw new Error(`admin list services failed: ${response.status()}`);
  }

  const body = (await response.json()) as {
    data: Array<{ id: string; name: string }>;
  };

  return body.data.find((service) => service.name === name)?.id ?? null;
}

// 確保 active 服務至少有一個公開可預約時段，避免 seed 時段被其他測試占用。
export async function ensurePublicAvailabilitySlot(
  request: APIRequestContext,
  serviceId: string,
  identityKey: string,
): Promise<void> {
  const availability = await request.get(`${API_BASE_URL}/api/services/${serviceId}/availability`);

  if (!availability.ok()) {
    throw new Error(`availability check failed: ${availability.status()}`);
  }

  const body = (await availability.json()) as { data: unknown[] };

  if (body.data.length > 0) {
    return;
  }

  const adminEmail = `e2e-ensure-admin-${identityKey}@example.com`;
  const adminSession = await registerAndLogin(request, adminEmail, 'Ensure Slot Admin');
  promoteUserToAdmin(adminEmail);
  await createAdminAvailabilitySlot(request, adminSession.token, serviceId, 60, 60);
}

// 解析 API 錯誤碼，供 UI 反向流程斷言使用。
export async function readApiErrorCode(response: APIResponse): Promise<string | undefined> {
  const body = (await response.json()) as ApiErrorBody;
  return body.error?.code;
}
