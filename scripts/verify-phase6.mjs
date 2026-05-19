#!/usr/bin/env node
// Phase 6 風險補強與 MVP 驗收腳本；需先啟動 API 與 PostgreSQL。
import { execSync } from 'node:child_process';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://booking_scheduler:booking_scheduler@localhost:5432/booking_scheduler';
const COOKIE_NAME = 'booking_session';
const runId = Date.now();

const results = [];

// 記錄單一驗證結果。
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

// 呼叫 API 並回傳 status 與 JSON body。
async function api(method, path, { cookie, body, headers, forwardedFor } = {}) {
  const requestHeaders = { 'Content-Type': 'application/json', ...(headers ?? {}) };

  if (forwardedFor) {
    requestHeaders['X-Forwarded-For'] = forwardedFor;
  }

  if (cookie) {
    requestHeaders.Cookie = `${COOKIE_NAME}=${encodeURIComponent(cookie)}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return { status: response.status, json, response };
}

// 從 login 回應擷取 session token。
function readSessionToken(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const target = cookies.find((item) => item.startsWith(`${COOKIE_NAME}=`));

  if (!target) {
    return null;
  }

  return decodeURIComponent(target.split(';')[0].slice(COOKIE_NAME.length + 1));
}

// 註冊並登入；可指定 forwarded IP，避免與 rate limit 測試共用計數。
async function registerAndLogin(email, password, displayName, forwardedFor) {
  const register = await api('POST', '/api/auth/register', {
    forwardedFor,
    body: { email, password, displayName },
  });

  if (register.status !== 200 && register.status !== 201) {
    throw new Error(`register failed for ${email}: ${register.status} ${JSON.stringify(register.json)}`);
  }

  const login = await api('POST', '/api/auth/login', {
    forwardedFor,
    body: { email, password },
  });

  if (login.status !== 200) {
    throw new Error(`login failed for ${email}: ${login.status}`);
  }

  return {
    token: readSessionToken(login.response),
    userId: login.json.data.id,
  };
}

function resolveSqlRunner() {
  if (process.env.POSTGRES_CONTAINER) {
    return `docker exec ${process.env.POSTGRES_CONTAINER} psql -U booking_scheduler -d booking_scheduler -tAc`;
  }

  try {
    execSync('command -v psql', { encoding: 'utf8', stdio: 'pipe' });
    return `psql "${DATABASE_URL}" -tAc`;
  } catch {
    return 'docker exec full-stack-postgres-1 psql -U booking_scheduler -d booking_scheduler -tAc';
  }
}

const SQL_RUNNER = resolveSqlRunner();

// 執行 SQL 查詢。
function sql(query) {
  return execSync(`${SQL_RUNNER} ${JSON.stringify(query)}`, { encoding: 'utf8' }).trim();
}

// 計算有效 booking 數量。
function countActiveBookingsForUser(userId) {
  return Number(
    sql(
      `SELECT COUNT(*)::text FROM bookings WHERE user_id = '${userId.replace(/'/g, "''")}' AND status <> 'cancelled'`,
    ),
  );
}

async function main() {
  console.log(`\n=== Phase 6 verification (run ${runId}) ===\n`);

  const password = 'password123';
  const memberEmail = `phase6-member-${runId}@example.com`;
  const adminEmail = `phase6-admin-${runId}@example.com`;
  const rateMemberEmail = `phase6-rate-member-${runId}@example.com`;
  const loginBurstEmail = `phase6-login-burst-${runId}@example.com`;
  const loginMsgEmail = `phase6-login-msg-${runId}@example.com`;

  const member = await registerAndLogin(memberEmail, password, 'Phase6 Member', '10.80.1.1');
  const adminUser = await registerAndLogin(adminEmail, password, 'Phase6 Admin', '10.80.1.2');
  const rateMember = await registerAndLogin(rateMemberEmail, password, 'Rate Member', '10.80.1.3');
  await api('POST', '/api/auth/register', {
    forwardedFor: '10.80.1.4',
    body: { email: loginBurstEmail, password, displayName: 'Login Burst' },
  });
  await api('POST', '/api/auth/register', {
    forwardedFor: '10.80.1.5',
    body: { email: loginMsgEmail, password, displayName: 'Login Msg' },
  });
  sql(`UPDATE users SET role = 'admin' WHERE email = '${adminEmail.replace(/'/g, "''")}'`);

  const adminSvc = await api('POST', '/api/admin/services', {
    cookie: adminUser.token,
    body: { name: `P6 ${runId}`, durationMinutes: 60, price: 1000, status: 'active' },
  });
  const serviceId = adminSvc.json.data?.id;

  const slotIds = [];
  for (let index = 0; index < 20; index += 1) {
    const start = new Date(Date.now() + (index + 3) * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const slot = await api('POST', '/api/admin/availability-slots', {
      cookie: adminUser.token,
      body: { serviceId, startAt: start.toISOString(), endAt: end.toISOString(), status: 'available' },
    });
    slotIds.push(slot.json.data?.id);
  }

  // --- 重複建立預約 ---
  const dupSlot = slotIds[0];
  const dup1 = await api('POST', '/api/bookings', {
    cookie: member.token,
    body: { availabilitySlotId: dupSlot },
  });
  const dup2 = await api('POST', '/api/bookings', {
    cookie: member.token,
    body: { availabilitySlotId: dupSlot },
  });
  check('重複送出建立預約不會產生多筆有效 booking', (dup1.status === 200 || dup1.status === 201) && dup2.status === 409);

  // --- 權限 ---
  const otherEmail = `phase6-other-${runId}@example.com`;
  const other = await registerAndLogin(otherEmail, password, 'Other', '10.80.1.6');
  const otherBooking = await api('POST', '/api/bookings', {
    cookie: other.token,
    body: { availabilitySlotId: slotIds[1] },
  });
  const peekOther = await api('GET', `/api/me/bookings/${otherBooking.json.data?.id}`, { cookie: member.token });
  check('會員不可查看他人預約', peekOther.status === 404);

  const memberForbidden = await api('GET', '/api/admin/services', { cookie: member.token });
  check('非 admin 被阻擋', memberForbidden.status === 403);

  // --- E2E 流程（API 層） ---
  const publicList = await api('GET', '/api/services');
  check('E2E：公開服務瀏覽列表', publicList.status === 200);

  const publicDetail = await api('GET', `/api/services/${serviceId}`);
  check('E2E：公開服務詳情', publicDetail.status === 200);

  const publicAvail = await api('GET', `/api/services/${serviceId}/availability`);
  check('E2E：公開可預約時段', publicAvail.status === 200);

  const e2eCreate = await api('POST', '/api/bookings', {
    cookie: member.token,
    body: { availabilitySlotId: slotIds[2] },
  });
  check('E2E：登入後建立預約', e2eCreate.status === 200 || e2eCreate.status === 201);

  const e2eCancel = await api('POST', `/api/me/bookings/${e2eCreate.json.data?.id}/cancel`, {
    cookie: member.token,
    body: { reason: 'e2e' },
  });
  check('E2E：會員取消預約', e2eCancel.status === 200);

  const e2eAdminSvc = await api('POST', '/api/admin/services', {
    cookie: adminUser.token,
    body: { name: `E2E ${runId}`, durationMinutes: 60, price: 500, status: 'active' },
  });
  const e2eSvcId = e2eAdminSvc.json.data?.id;
  const e2eAdminSlot = await api('POST', '/api/admin/availability-slots', {
    cookie: adminUser.token,
    body: {
      serviceId: e2eSvcId,
      startAt: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.now() + 51 * 60 * 60 * 1000).toISOString(),
      status: 'available',
    },
  });
  const e2eAdminBooking = await api('POST', '/api/admin/bookings', {
    cookie: adminUser.token,
    body: { userId: member.userId, availabilitySlotId: e2eAdminSlot.json.data?.id },
  });
  const e2eAdminCancel = await api('POST', `/api/admin/bookings/${e2eAdminBooking.json.data?.id}/cancel`, {
    cookie: adminUser.token,
    body: { reason: 'e2e admin' },
  });
  check(
    'E2E：admin 建立服務、時段、預約、取消預約',
    (e2eAdminSvc.status === 200 || e2eAdminSvc.status === 201) &&
      (e2eAdminSlot.status === 200 || e2eAdminSlot.status === 201) &&
      (e2eAdminBooking.status === 200 || e2eAdminBooking.status === 201) &&
      e2eAdminCancel.status === 200,
  );

  // --- 完整性檢查 ---
  const hiddenPublic = (publicList.json.data ?? []).some((item) => item.status === 'hidden');
  check('Public API 不回傳 hidden 服務', !hiddenPublic);
  check('booking_status_logs 於建立/取消寫入', Number(sql('SELECT COUNT(*)::text FROM booking_status_logs')) > 0);
  check('Admin 操作寫入 audit_logs', Number(sql("SELECT COUNT(*)::text FROM audit_logs WHERE action LIKE 'admin.%'")) > 0);

  // --- Rate limit 測試（放最後，避免影響前置註冊） ---
  const fakeLogin = await api('POST', '/api/auth/login', {
    forwardedFor: '10.90.0.1',
    body: { email: `no-such-${runId}@example.com`, password },
  });
  const wrongLogin = await api('POST', '/api/auth/login', {
    forwardedFor: '10.90.0.1',
    body: { email: loginMsgEmail, password: 'wrong-password' },
  });
  check(
    '登入失敗訊息不透露帳號是否存在',
    fakeLogin.json.error?.code === 'INVALID_CREDENTIALS' &&
      wrongLogin.json.error?.code === 'INVALID_CREDENTIALS' &&
      fakeLogin.json.error?.message === wrongLogin.json.error?.message,
  );

  const registerStatuses = [];
  for (let index = 0; index < 6; index += 1) {
    const result = await api('POST', '/api/auth/register', {
      forwardedFor: '10.90.1.1',
      body: {
        email: `phase6-reg-burst-${runId}-${index}@example.com`,
        password,
        displayName: `Burst ${index}`,
      },
    });
    registerStatuses.push(result.status);
  }
  check(
    'POST /api/auth/register 超過限制回 429 RATE_LIMITED',
    registerStatuses.filter((status) => status === 429).length >= 1,
    registerStatuses.join(','),
  );

  const loginStatuses = [];
  for (let index = 0; index < 6; index += 1) {
    const result = await api('POST', '/api/auth/login', {
      forwardedFor: '10.90.2.1',
      body: { email: loginBurstEmail, password: 'wrong-password' },
    });
    loginStatuses.push(result.status);
  }
  check(
    'POST /api/auth/login 超過限制回 429 RATE_LIMITED',
    loginStatuses.includes(429),
    loginStatuses.join(','),
  );
  check(
    '登入 rate limit 使用 IP + email',
    loginStatuses.slice(0, 5).every((status) => status === 401) && loginStatuses.includes(429),
  );

  const rateSlots = slotIds.slice(3, 9);
  const bookingsBefore = countActiveBookingsForUser(rateMember.userId);
  const createStatuses = [];
  for (const slotId of rateSlots) {
    const result = await api('POST', '/api/bookings', {
      cookie: rateMember.token,
      body: { availabilitySlotId: slotId },
    });
    createStatuses.push(result.status);
  }
  const sixthCreate = await api('POST', '/api/bookings', {
    cookie: rateMember.token,
    body: { availabilitySlotId: slotIds[9] },
  });
  createStatuses.push(sixthCreate.status);
  const bookingsAfter = countActiveBookingsForUser(rateMember.userId);
  check('POST /api/bookings 超過限制回 429 RATE_LIMITED', createStatuses.includes(429), createStatuses.join(','));
  check(
    '建立預約被 rate limit 擋下時不可產生 booking',
    bookingsAfter - bookingsBefore <= 5,
    `before=${bookingsBefore} after=${bookingsAfter}`,
  );

  const cancelBookingIds = [];
  for (let index = 0; index < 6; index += 1) {
    const created = await api('POST', '/api/admin/bookings', {
      cookie: adminUser.token,
      body: { userId: rateMember.userId, availabilitySlotId: slotIds[10 + index] },
    });
    cancelBookingIds.push(created.json.data?.id);
  }

  const cancelStatuses = [];
  for (const bookingId of cancelBookingIds) {
    const result = await api('POST', `/api/me/bookings/${bookingId}/cancel`, {
      cookie: rateMember.token,
      body: { reason: 'rate-limit-test' },
    });
    cancelStatuses.push(result.status);
  }

  const sixthBookingId = cancelBookingIds[5];
  const sixthStatus = sql(`SELECT status FROM bookings WHERE id = '${String(sixthBookingId).replace(/'/g, "''")}'`);
  check('POST cancel 超過限制回 429 RATE_LIMITED', cancelStatuses.includes(429), cancelStatuses.join(','));
  check(
    '取消預約被 rate limit 擋下時不可異動 booking',
    sixthStatus === 'confirmed',
    `6th booking status=${sixthStatus}`,
  );

  const publicStatuses = [];
  for (let index = 0; index < 122; index += 1) {
    const result = await api('GET', '/api/services?page=1&pageSize=1', {
      forwardedFor: '10.90.4.1',
    });
    publicStatuses.push(result.status);
  }
  check('Public API 超過限制回 429 RATE_LIMITED', publicStatuses.includes(429));

  const adminStatuses = [];
  for (let index = 0; index < 62; index += 1) {
    const result = await api('GET', '/api/admin/services?page=1&pageSize=1', {
      cookie: adminUser.token,
      forwardedFor: '10.90.5.1',
    });
    adminStatuses.push(result.status);
  }
  check('Admin API 超過限制回 429 RATE_LIMITED', adminStatuses.includes(429));

  const authAfterLimit = await api('GET', '/api/admin/services', { cookie: member.token });
  check('Rate limit 不可取代授權檢查', authAfterLimit.status === 403);

  const failed = results.filter((item) => !item.passed);
  console.log(`\n=== 結果：${results.length - failed.length}/${results.length} 通過 ===\n`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
