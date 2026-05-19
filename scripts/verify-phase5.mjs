#!/usr/bin/env node
// Phase 5 Admin API 自動驗證腳本；需先啟動 API 與 PostgreSQL。
import { execSync } from 'node:child_process';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3001';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://booking_scheduler:booking_scheduler@localhost:5432/booking_scheduler';
const COOKIE_NAME = 'booking_session';
const runId = Date.now();

const results = [];

// 記錄單一驗證結果，失敗時輸出預期與實際狀態。
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

// 呼叫 API 並回傳 status 與 JSON body。
async function api(method, path, { cookie, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) {
    headers.Cookie = `${COOKIE_NAME}=${encodeURIComponent(cookie)}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
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

// 從 login 回應擷取 session token（忽略 Secure 限制，供本機驗證使用）。
function readSessionToken(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const target = cookies.find((item) => item.startsWith(`${COOKIE_NAME}=`));

  if (!target) {
    return null;
  }

  const value = target.split(';')[0].slice(COOKIE_NAME.length + 1);
  return decodeURIComponent(value);
}

// 註冊並登入，回傳 session token 與 user id。
async function registerAndLogin(email, password, displayName) {
  const register = await api('POST', '/api/auth/register', {
    body: { email, password, displayName },
  });

  if (register.status !== 200 && register.status !== 201) {
    throw new Error(`register failed for ${email}: ${register.status} ${JSON.stringify(register.json)}`);
  }

  const login = await api('POST', '/api/auth/login', {
    body: { email, password },
  });

  if (login.status !== 200) {
    throw new Error(`login failed for ${email}: ${login.status} ${JSON.stringify(login.json)}`);
  }

  const token = readSessionToken(login.response);

  if (!token) {
    throw new Error(`missing session cookie for ${email}`);
  }

  return {
    token,
    userId: login.json.data.id,
  };
}

// 偵測本機 psql；沒有則透過 Docker Postgres 容器執行 SQL。
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

// 以 psql 執行 SQL（用於升級 admin 與查詢 audit_logs）。
function sql(query) {
  return execSync(`${SQL_RUNNER} ${JSON.stringify(query)}`, { encoding: 'utf8' }).trim();
}

// 查詢 audit_logs 是否包含指定 action。
function hasAuditLog(action) {
  const count = sql(`SELECT COUNT(*)::text FROM audit_logs WHERE action = '${action.replace(/'/g, "''")}'`);
  return Number(count) > 0;
}

async function main() {
  console.log(`\n=== Phase 5 verification (run ${runId}) ===\n`);

  // migration：確認 audit_logs 表存在且欄位符合 db_schema 核心欄位
  try {
    const tableExists = sql("SELECT to_regclass('public.audit_logs') IS NOT NULL");
    check('audit_logs migration 表存在', tableExists === 't');

    const columns = sql(
      "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='audit_logs'",
    );
    const required = ['action', 'actor_user_id', 'created_at', 'id', 'metadata', 'target_id', 'target_type'];
    const hasAll = required.every((col) => columns.split(',').includes(col));
    check('audit_logs migration 欄位符合 db_schema', hasAll, columns);
  } catch (error) {
    check('audit_logs migration（需 psql）', false, String(error));
  }

  const unauth = await api('GET', '/api/admin/services');
  check('未登入 Admin API 回 401', unauth.status === 401 && unauth.json.error?.code === 'UNAUTHENTICATED');

  const memberEmail = `phase5-member-${runId}@example.com`;
  const adminEmail = `phase5-admin-${runId}@example.com`;
  const password = 'password123';

  const member = await registerAndLogin(memberEmail, password, 'Phase5 Member');
  const adminUser = await registerAndLogin(adminEmail, password, 'Phase5 Admin');

  sql(`UPDATE users SET role = 'admin' WHERE email = '${adminEmail.replace(/'/g, "''")}'`);

  const memberForbidden = await api('GET', '/api/admin/services', { cookie: member.token });
  check('非 admin 呼叫 Admin API 回 403', memberForbidden.status === 403 && memberForbidden.json.error?.code === 'FORBIDDEN');

  const adminCookie = adminUser.token;

  const activeSvc = await api('POST', '/api/admin/services', {
    cookie: adminCookie,
    body: {
      name: `Active ${runId}`,
      durationMinutes: 60,
      price: 1000,
      status: 'active',
    },
  });
  check('Admin 建立 active 服務', activeSvc.status === 200 || activeSvc.status === 201);
  check('admin.service.create audit log', hasAuditLog('admin.service.create'));

  const inactiveSvc = await api('POST', '/api/admin/services', {
    cookie: adminCookie,
    body: {
      name: `Inactive ${runId}`,
      durationMinutes: 60,
      price: 500,
      status: 'inactive',
    },
  });
  const hiddenSvc = await api('POST', '/api/admin/services', {
    cookie: adminCookie,
    body: {
      name: `Hidden ${runId}`,
      durationMinutes: 60,
      price: 500,
      status: 'hidden',
    },
  });

  const activeId = activeSvc.json.data?.id;
  const inactiveId = inactiveSvc.json.data?.id;
  const hiddenId = hiddenSvc.json.data?.id;

  const listAll = await api('GET', '/api/admin/services?page=1&pageSize=50', { cookie: adminCookie });
  const statuses = new Set((listAll.json.data ?? []).map((item) => item.status));
  check('GET /api/admin/services 含 active/inactive/hidden', statuses.has('active') && statuses.has('inactive') && statuses.has('hidden'));

  const hiddenDetail = await api('GET', `/api/admin/services/${hiddenId}`, { cookie: adminCookie });
  check('GET hidden 服務詳情', hiddenDetail.status === 200 && hiddenDetail.json.data?.status === 'hidden');

  const patchSvc = await api('PATCH', `/api/admin/services/${activeId}`, {
    cookie: adminCookie,
    body: { name: `Active Updated ${runId}` },
  });
  check('Admin 更新服務', patchSvc.status === 200);
  check('admin.service.update audit log', hasAuditLog('admin.service.update'));

  const soonStartDate = new Date(Date.now() + 20 * 60 * 1000);
  const soonEndDate = new Date(soonStartDate.getTime() + 60 * 60 * 1000);
  const soonStart = soonStartDate.toISOString();
  const soonEnd = soonEndDate.toISOString();
  const nearSlot = await api('POST', '/api/admin/availability-slots', {
    cookie: adminCookie,
    body: { serviceId: activeId, startAt: soonStart, endAt: soonEnd, status: 'available' },
  });
  check('Admin 建立時段（不受 1 小時限制）', nearSlot.status === 200 || nearSlot.status === 201);
  check('admin.availability_slot.create audit log', hasAuditLog('admin.availability_slot.create'));

  const badStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const badDuration = await api('POST', '/api/admin/availability-slots', {
    cookie: adminCookie,
    body: {
      serviceId: activeId,
      startAt: badStart.toISOString(),
      endAt: new Date(badStart.getTime() + 30 * 60 * 1000).toISOString(),
      status: 'available',
    },
  });
  check('建立時段需符合 durationMinutes', badDuration.status === 400 && badDuration.json.error?.code === 'INVALID_TIME_RANGE');

  const inactiveStart = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const inactiveSlot = await api('POST', '/api/admin/availability-slots', {
    cookie: adminCookie,
    body: {
      serviceId: inactiveId,
      startAt: inactiveStart.toISOString(),
      endAt: new Date(inactiveStart.getTime() + 60 * 60 * 1000).toISOString(),
      status: 'available',
    },
  });
  check('不可替 inactive 服務建立時段', inactiveSlot.status === 409 && inactiveSlot.json.error?.code === 'SERVICE_NOT_ACTIVE');

  const hiddenStart = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const hiddenSlot = await api('POST', '/api/admin/availability-slots', {
    cookie: adminCookie,
    body: {
      serviceId: hiddenId,
      startAt: hiddenStart.toISOString(),
      endAt: new Date(hiddenStart.getTime() + 60 * 60 * 1000).toISOString(),
      status: 'available',
    },
  });
  check('不可替 hidden 服務建立時段', hiddenSlot.status === 409 && hiddenSlot.json.error?.code === 'SERVICE_NOT_ACTIVE');

  const slotId = nearSlot.json.data?.id;

  // 選一個確定為週二的日期，避免 weekdays 篩選導致 created=0。
  const bulkTuesday = '2099-01-06';
  const bulkWeekday = new Date(`${bulkTuesday}T00:00:00Z`).getUTCDay() || 7;

  const bulk1 = await api('POST', '/api/admin/availability-slots/bulk-generate', {
    cookie: adminCookie,
    body: {
      serviceId: activeId,
      timezone: 'Asia/Taipei',
      dateFrom: bulkTuesday,
      dateTo: bulkTuesday,
      weekdays: [bulkWeekday === 0 ? 7 : bulkWeekday],
      timeRanges: [{ startTime: '10:00', endTime: '12:00' }],
    },
  });
  check('批次產生時段回傳 created/skipped', bulk1.status === 200 && typeof bulk1.json.data?.created === 'number');
  check('admin.availability_slot.bulk_generate audit log', hasAuditLog('admin.availability_slot.bulk_generate'));

  const bulk2 = await api('POST', '/api/admin/availability-slots/bulk-generate', {
    cookie: adminCookie,
    body: {
      serviceId: activeId,
      timezone: 'Asia/Taipei',
      dateFrom: bulkTuesday,
      dateTo: bulkTuesday,
      weekdays: [bulkWeekday === 0 ? 7 : bulkWeekday],
      timeRanges: [{ startTime: '10:00', endTime: '12:00' }],
    },
  });
  check('批次產生會跳過重複時段', bulk2.status === 200 && bulk2.json.data?.skipped >= 1);

  const bulkBadTz = await api('POST', '/api/admin/availability-slots/bulk-generate', {
    cookie: adminCookie,
    body: {
      serviceId: activeId,
      timezone: 'UTC',
      dateFrom: '2099-01-07',
      dateTo: '2099-01-07',
      weekdays: [2],
      timeRanges: [{ startTime: '10:00', endTime: '12:00' }],
    },
  });
  check('批次產生僅支援 Asia/Taipei', bulkBadTz.status === 400);

  const updateSlotStart = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const updateSlot = await api('POST', '/api/admin/availability-slots', {
    cookie: adminCookie,
    body: {
      serviceId: activeId,
      startAt: updateSlotStart.toISOString(),
      endAt: new Date(updateSlotStart.getTime() + 60 * 60 * 1000).toISOString(),
      status: 'available',
    },
  });
  const patchSlot = await api('PATCH', `/api/admin/availability-slots/${updateSlot.json.data?.id}`, {
    cookie: adminCookie,
    body: { status: 'blocked' },
  });
  check('Admin 更新時段', patchSlot.status === 200);
  check('admin.availability_slot.update audit log', hasAuditLog('admin.availability_slot.update'));

  const bookingsBefore = await api('GET', '/api/admin/bookings?page=1&pageSize=5', { cookie: adminCookie });
  check('GET /api/admin/bookings', bookingsBefore.status === 200);

  const createBooking = await api('POST', '/api/admin/bookings', {
    cookie: adminCookie,
    body: { userId: member.userId, availabilitySlotId: slotId, note: 'admin created' },
  });
  check('Admin 建立預約', createBooking.status === 200 || createBooking.status === 201);
  check('admin.booking.create audit log', hasAuditLog('admin.booking.create'));

  const bookingId = createBooking.json.data?.id;
  const statusLogCreate = sql(
    `SELECT COUNT(*)::text FROM booking_status_logs WHERE booking_id = '${bookingId}' AND from_status IS NULL AND to_status = 'confirmed'`,
  );
  check('建立預約寫入 null->confirmed status log', Number(statusLogCreate) >= 1);

  const dupBooking = await api('POST', '/api/admin/bookings', {
    cookie: adminCookie,
    body: { userId: member.userId, availabilitySlotId: slotId },
  });
  check('同時段不可重複有效 booking', dupBooking.status === 409);

  const patchBooking = await api('PATCH', `/api/admin/bookings/${bookingId}`, {
    cookie: adminCookie,
    body: { note: 'updated note' },
  });
  check('Admin 更新預約備註', patchBooking.status === 200);
  check('admin.booking.update audit log', hasAuditLog('admin.booking.update'));

  const cancelBooking = await api('POST', `/api/admin/bookings/${bookingId}/cancel`, {
    cookie: adminCookie,
    body: { reason: 'admin cancel' },
  });
  check('Admin 取消 confirmed 預約', cancelBooking.status === 200);
  check('admin.booking.cancel audit log', hasAuditLog('admin.booking.cancel'));

  const statusLogCancel = sql(
    `SELECT COUNT(*)::text FROM booking_status_logs WHERE booking_id = '${bookingId}' AND from_status = 'confirmed' AND to_status = 'cancelled'`,
  );
  check('取消預約寫入 confirmed->cancelled status log', Number(statusLogCancel) >= 1);

  const cancelAgain = await api('POST', `/api/admin/bookings/${bookingId}/cancel`, {
    cookie: adminCookie,
    body: { reason: 'again' },
  });
  check('重複取消回 409 BOOKING_NOT_CANCELABLE', cancelAgain.status === 409 && cancelAgain.json.error?.code === 'BOOKING_NOT_CANCELABLE');

  const pastStartDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const pastStart = pastStartDate.toISOString();
  const pastEnd = new Date(pastStartDate.getTime() + 60 * 60 * 1000).toISOString();
  const pastSlot = await api('POST', '/api/admin/availability-slots', {
    cookie: adminCookie,
    body: { serviceId: activeId, startAt: pastStart, endAt: pastEnd, status: 'available' },
  });
  const pastSlotId = pastSlot.json.data?.id;
  const completedBooking = await api('POST', '/api/admin/bookings', {
    cookie: adminCookie,
    body: { userId: member.userId, availabilitySlotId: pastSlotId },
  });
  const completedBookingId = completedBooking.json.data?.id;
  const cancelCompleted = await api('POST', `/api/admin/bookings/${completedBookingId}/cancel`, {
    cookie: adminCookie,
    body: { reason: 'should fail' },
  });
  check('不可取消 completed 預約', cancelCompleted.status === 409 && cancelCompleted.json.error?.code === 'BOOKING_NOT_CANCELABLE');

  const noStatusPatch = await api('PATCH', `/api/admin/bookings/${completedBookingId}/status`, {
    cookie: adminCookie,
    body: { status: 'completed' },
  });
  check('MVP 不提供 PATCH .../status', noStatusPatch.status === 404);

  const auditList = await api('GET', '/api/admin/audit-logs?page=1&pageSize=20&action=admin.booking.cancel', {
    cookie: adminCookie,
  });
  check('GET /api/admin/audit-logs', auditList.status === 200 && Array.isArray(auditList.json.data));

  const auditCountBefore = sql('SELECT COUNT(*)::text FROM audit_logs');
  await api('GET', '/api/admin/services?page=1&pageSize=1', { cookie: adminCookie });
  const auditCountAfter = sql('SELECT COUNT(*)::text FROM audit_logs');
  check('查詢類 Admin API 不寫 audit log', auditCountBefore === auditCountAfter);

  check('Admin API 權限由後端 role 檢查', memberForbidden.status === 403);

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
