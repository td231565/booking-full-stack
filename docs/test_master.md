# 預約排程系統 — 主測試文件

> 測試目的：驗證業務行為與預期結果一致，而非覆蓋程式碼行數。
> 撰寫基礎：`MVP_SPEC.md`、`api_contract.md`、`db_schema.md`、`frontend_flow.md`
>
> **整合來源**：`test_scenarios.md`（後端 / DB / E2E 規格）、`test-checklist.md`（Angular 前端 QA 驗收清單）

---

## 0. 測試策略與分層

### 0.1 測試層次定義

| 層次 | 測試對象 | 隔離範圍 | 工具建議 |
| --- | --- | --- | --- |
| **Service 單元測試** | BookingService、AuthService 等業務邏輯 | Mock Repository，不碰真實 DB | Jest / Vitest |
| **Repository 整合測試** | SQL 查詢、Constraint、Transaction | 使用真實 PostgreSQL（測試專用 DB） | Jest + pg / Prisma |
| **API 整合測試** | Controller + Service + DB 完整流程 | 使用測試 DB，真實 HTTP 請求 | Supertest / httpx |
| **前端函式單元測試** | API client、日期工具、Zod schema | Mock fetch | Vitest / Jest |
| **UI 元件測試** | Angular / React 元件渲染與互動行為 | Mock API 回應 | Vitest + Testing Library / Angular TestBed |
| **E2E 測試** | 完整使用者流程（瀏覽器層級） | 真實前後端，測試資料庫 | Playwright |

### 0.2 測試環境隔離原則

- 每個測試套件執行前建立乾淨的測試資料（Test Fixtures）
- 每個測試案例後回滾 Transaction 或清除資料，確保獨立性
- 時間相關測試一律 Mock 系統時間（`jest.setSystemTime` / `vi.setSystemTime`），確保 Deterministic
- 不依賴外部服務（例如真實 email、第三方登入）
- Rate Limit 測試使用可重置的記憶體計數器

### 0.3 測試資料約定

本文件測試情境以下列固定測試資料為基礎：

```
user_a:    一般會員（role=user, status=active）
user_b:    一般會員（role=user, status=active）
user_c:    停用帳號（role=user, status=disabled）
admin_a:   管理員（role=admin, status=active）

service_active:   status=active, durationMinutes=60, price=1200
service_inactive: status=inactive, durationMinutes=60, price=800
service_hidden:   status=hidden, durationMinutes=30, price=500

slot_future_2h:   status=available, startAt=現在+2小時（可預約）
slot_future_30m:  status=available, startAt=現在+30分鐘（不可預約，1小時內）
slot_past:        status=available, startAt=過去時間（不可預約）
slot_blocked:     status=blocked, startAt=現在+3小時
slot_inactive:    status=inactive, startAt=現在+3小時
slot_booked:      status=available, startAt=現在+5小時（已有 confirmed booking）

booking_confirmed_future_5h: user_a, slot startAt=現在+5小時, status=confirmed
booking_confirmed_future_3h: user_a, slot startAt=現在+3小時, status=confirmed（不可取消）
booking_cancelled:           user_a, status=cancelled
booking_completed:           user_a, slot endAt=過去時間, status=confirmed（對外顯示 completed）
```

---

## 1. 後端 API 單元測試（Service Layer）

> 測試對象：Service 類別的業務邏輯函式
> 隔離策略：Mock Repository，不涉及真實 DB

---

### 1.1 AuthService — 註冊

#### TC-AUTH-REG-001｜Happy Path：正常註冊

```
前提：email 尚未存在
輸入：{ email: "new@example.com", password: "Pass123!", displayName: "王小明" }
預期：
  - 呼叫 repository.create，password 未明文傳入
  - 回傳 user 物件（不含 passwordHash）
  - role = "user"，status = "active"
```

#### TC-AUTH-REG-002｜Edge：email 大小寫正規化

```
輸入：{ email: "NEW@EXAMPLE.COM", ... }
預期：
  - 儲存前將 email 轉為小寫
  - 與已存在的 "new@example.com" 衝突時回 EMAIL_ALREADY_USED
```

#### TC-AUTH-REG-003｜反向：email 已被使用

```
前提：email 已存在
輸入：同上
預期：throw EmailAlreadyUsedException → code: EMAIL_ALREADY_USED, HTTP 409
```

#### TC-AUTH-REG-004｜反向：缺少必填欄位

```
輸入：{ email: "a@example.com" }（缺 password、displayName）
預期：throw ValidationException → code: VALIDATION_ERROR, HTTP 400
```

#### TC-AUTH-REG-005｜反向：email 格式錯誤

```
輸入：{ email: "not-an-email", password: "Pass123!", displayName: "Test" }
預期：throw ValidationException → code: VALIDATION_ERROR, HTTP 400
```

#### TC-AUTH-REG-006｜Edge：password 強度邊界

```
輸入：password 長度恰好達到最低限制
預期：成功

輸入：password 長度少於最低限制
預期：VALIDATION_ERROR
```

---

### 1.2 AuthService — 登入

#### TC-AUTH-LOGIN-001｜Happy Path：正常登入

```
前提：user_a 存在，密碼正確
輸入：{ email: "user_a@example.com", password: "正確密碼" }
預期：
  - 建立 session，儲存 session_token_hash（非明文）
  - 回傳 user 物件（不含 passwordHash）
  - Cookie 設定 HttpOnly、Secure、SameSite=Lax
```

#### TC-AUTH-LOGIN-002｜反向：密碼錯誤

```
輸入：正確 email + 錯誤密碼
預期：
  - code: INVALID_CREDENTIALS, HTTP 401
  - 錯誤訊息不透露帳號是否存在（訊息與不存在帳號相同）
```

#### TC-AUTH-LOGIN-003｜反向：帳號不存在

```
輸入：不存在的 email
預期：
  - code: INVALID_CREDENTIALS, HTTP 401
  - 錯誤訊息與密碼錯誤時相同（防帳號列舉）
```

#### TC-AUTH-LOGIN-004｜反向：帳號已停用

```
前提：user_c（status=disabled）
輸入：正確 email + 正確密碼
預期：code: USER_DISABLED, HTTP 403
```

#### TC-AUTH-LOGIN-005｜Edge：重複登入建立多個 session

```
前提：user_a 已有有效 session
輸入：再次登入
預期：
  - 建立新 session（MVP 允許多 session）
  - 舊 session 仍有效（未自動 revoke）
```

---

### 1.3 AuthService — 登出

#### TC-AUTH-LOGOUT-001｜Happy Path

```
前提：user_a 已登入，session 有效
預期：
  - session.revoked_at 被設定為目前時間
  - Cookie 被清除
  - 回傳 { data: null }
```

#### TC-AUTH-LOGOUT-002｜反向：未登入呼叫登出

```
前提：無有效 session（Cookie 不存在或已過期）
預期：code: UNAUTHENTICATED, HTTP 401
```

#### TC-AUTH-LOGOUT-003｜Edge：已撤銷的 session 再次登出

```
前提：session 已被 revoke
預期：code: UNAUTHENTICATED, HTTP 401
```

---

### 1.4 AuthService — 取得目前登入者

#### TC-AUTH-ME-001｜Happy Path

```
前提：user_a 已登入，session 未過期且未 revoked
預期：回傳 user 物件（不含 passwordHash、session_token_hash）
```

#### TC-AUTH-ME-002｜反向：session 過期

```
前提：session.expires_at 早於目前時間
預期：code: UNAUTHENTICATED, HTTP 401
```

#### TC-AUTH-ME-003｜反向：session 已 revoked

```
前提：session.revoked_at 已設定
預期：code: UNAUTHENTICATED, HTTP 401
```

---

### 1.5 雙 Session 登入分離（前台／後台）

對應整合測試：`apps/api/test/auth.e2e.spec.ts`、`admin-auth.e2e.spec.ts`；E2E：`e2e/tests/session-isolation.spec.ts`。

| 測試 ID | 情境 | 預期 |
| --- | --- | --- |
| TC-AUTH-SESSION-01（AUTH-M-01） | `POST /api/auth/login` | Set-Cookie 僅 `booking_member_session` |
| TC-AUTH-SESSION-02（AUTH-M-02） | `GET /api/auth/me` 帶 member cookie | 200 |
| TC-AUTH-SESSION-03（AUTH-M-03） | `POST /api/auth/logout` | 清除 member cookie；同 token `/me` → 401 |
| TC-AUTH-SESSION-04（AUTH-M-04） | `GET /api/auth/me` 僅帶 admin cookie | 401 |
| TC-AUTH-SESSION-05（AUTH-A-01） | `POST /api/admin/auth/login`（admin） | Set-Cookie 僅 `booking_admin_session` |
| TC-AUTH-SESSION-06（AUTH-A-02） | `GET /api/admin/auth/me` 帶 admin cookie | 200，`role=admin` |
| TC-AUTH-SESSION-07（AUTH-A-03） | `POST /api/admin/auth/login`（一般會員） | 403，不 Set admin cookie |
| TC-AUTH-SESSION-08（AUTH-A-04） | `POST /api/admin/auth/logout` | 僅清 admin；admin `/me` → 401 |
| TC-AUTH-SESSION-09（AUTH-A-05） | `GET /api/admin/services` 僅 member cookie | 401 |
| TC-AUTH-SESSION-10（AUTH-A-06） | `GET /api/admin/services` 僅 admin cookie | 200 |
| TC-AUTH-SESSION-11（AUTH-A-07） | 先 member 再 admin login | 兩 cookie 並存；兩邊 `/me` 皆 200 |
| TC-AUTH-SESSION-12（AUTH-A-08） | admin logout 後 | member `/me` 仍 200；admin `/me` 401 |
| TC-AUTH-SESSION-13（AUTH-A-09） | member logout 後 | admin `/me` 仍 200；member `/me` 401 |
| TC-AUTH-SESSION-14（E2E-03） | admin 僅 member 登入 → `/admin/bookings` | redirect `/admin/login` |
| TC-AUTH-SESSION-15（E2E-04） | 僅 admin 登入 → `/my/bookings` | redirect `/login` |
| TC-AUTH-SESSION-16（E2E-05） | member 預約流程 | cookie 名為 member，既有流程通過 |

#### TC-AUTH-SESSION-17｜前端：後台登入表單（WEB-01）

```
操作：AdminLoginForm 成功登入
預期：POST /api/admin/auth/login，導向 /admin/bookings
```

#### TC-AUTH-SESSION-18｜前端：非 admin 403（WEB-02）

```
操作：AdminLoginForm 以一般會員登入
預期：顯示無權限；不呼叫 POST /api/auth/logout
  【Angular】錯誤訊息應顯示「此帳號無後台管理權限。」，且不應引發前台會員登出的副作用
```

---

### 1.6 ServiceCatalogService — 公開服務列表

#### TC-SVC-LIST-001｜Happy Path

```
前提：DB 有 service_active、service_inactive、service_hidden
預期：
  - 回傳 service_active 與 service_inactive
  - 不回傳 service_hidden
  - 包含分頁 meta（page, pageSize, total, totalPages）
```

#### TC-SVC-LIST-002｜Edge：無任何公開服務

```
前提：只有 service_hidden
預期：data: []，total: 0
```

#### TC-SVC-LIST-003｜Edge：分頁邊界

```
前提：共 25 筆，pageSize=20
輸入：page=2
預期：回傳第 21-25 筆，totalPages=2
```

#### TC-SVC-LIST-004｜Edge：page 超出範圍

```
輸入：page=99（無資料）
預期：data: []，不應拋出錯誤
```

---

### 1.7 ServiceCatalogService — 公開服務詳情

#### TC-SVC-DETAIL-001｜Happy Path：active 服務

```
輸入：service_active.id
預期：回傳完整服務資料，status="active"
```

#### TC-SVC-DETAIL-002｜Happy Path：inactive 服務可被查看

```
輸入：service_inactive.id
預期：回傳服務資料，status="inactive"
  【Angular】詳情頁應顯示「此服務目前暫停預約，仍可查看服務內容。」，不出現預約時段與按鈕
```

#### TC-SVC-DETAIL-003｜反向：hidden 服務不回傳

```
輸入：service_hidden.id
預期：code: SERVICE_NOT_FOUND, HTTP 404
  （不透露服務存在但被隱藏，與不存在行為一致）
  【Angular】前端應正常導向 404 頁面
```

#### TC-SVC-DETAIL-004｜反向：服務不存在

```
輸入：隨機不存在的 UUID
預期：code: SERVICE_NOT_FOUND, HTTP 404
  【Angular】前端導向 404 頁面
```

---

### 1.8 AvailabilityService — 公開可預約時段

#### TC-AVAIL-LIST-001｜Happy Path

```
前提：service_active 有 slot_future_2h（available）
Mock 時間：現在
預期：
  - 回傳 slot_future_2h
  - startAt 至少在現在 +1 小時後
```

#### TC-AVAIL-LIST-002｜反向：過去時段不回傳

```
前提：slot_past（startAt=過去）
預期：不回傳
```

#### TC-AVAIL-LIST-003｜反向：1 小時內開始的時段不回傳

```
前提：slot_future_30m（startAt=現在+30分鐘）
預期：不回傳
```

#### TC-AVAIL-LIST-004｜反向：時段已被預約則不回傳

```
前提：slot_booked（有 confirmed booking）
預期：不回傳
```

#### TC-AVAIL-LIST-005｜反向：cancelled booking 不影響可用性

```
前提：時段曾有預約但已 cancelled
預期：時段仍應出現在可預約列表
```

#### TC-AVAIL-LIST-006｜反向：非 active 服務不回傳時段

```
輸入：service_inactive.id
預期：data: []（不回傳 inactive 服務的時段）
```

#### TC-AVAIL-LIST-007｜反向：blocked 或 inactive 時段不回傳

```
前提：slot_blocked、slot_inactive
預期：不回傳
```

#### TC-AVAIL-LIST-008｜Edge：from / to 時間篩選

```
輸入：from=明天, to=後天
預期：只回傳此範圍內的時段

輸入：from 晚於 to
預期：INVALID_TIME_RANGE, HTTP 400
```

#### TC-AVAIL-LIST-009｜Edge：1 小時邊界精確

```
Mock 時間：2026-05-21T10:00:00Z
前提：slot.startAt=2026-05-21T11:00:00Z（剛好 1 小時後）
預期：不回傳（需 strictly greater than 1 hour）

前提：slot.startAt=2026-05-21T11:00:01Z（1 小時後 1 秒）
預期：回傳
```

---

### 1.9 BookingService — 建立預約

#### TC-BOOK-CREATE-001｜Happy Path

```
前提：user_a 已登入，slot_future_2h 無任何有效預約
輸入：{ availabilitySlotId: slot_future_2h.id, note: "備註" }
預期：
  - 建立 booking，status="confirmed"
  - userId 取自 session（非前端傳入）
  - 寫入 booking_status_logs（from_status=null, to_status=confirmed）
  - 回傳 booking 資料
  【Angular】按鈕應更新為「建立中...」並停用，成功後導向詳情頁並帶 ?promptCalendar=1
```

#### TC-BOOK-CREATE-002｜反向：未登入

```
前提：無有效 session
預期：code: UNAUTHENTICATED, HTTP 401
  【Angular】應引導至登入頁，網址帶回當前服務詳情頁參數，例如 /login?redirect=/services/:serviceId
```

#### TC-BOOK-CREATE-003｜反向：時段不存在

```
輸入：{ availabilitySlotId: 不存在的 UUID }
預期：code: BOOKING_SLOT_NOT_FOUND, HTTP 404
```

#### TC-BOOK-CREATE-004｜反向：時段已被預約（競爭條件）

```
前提：slot_booked（已有 confirmed booking）
預期：code: BOOKING_SLOT_UNAVAILABLE, HTTP 409
  【Angular】顯示「此時段目前不可預約，請重新整理後選擇其他時段。」，並主動刷新當前頁面資訊
```

#### TC-BOOK-CREATE-005｜反向：1 小時內開始的時段

```
前提：slot_future_30m（startAt=現在+30分鐘）
預期：code: BOOKING_TOO_SOON, HTTP 409
  【Angular】顯示「只能預約 1 小時後開始的時段。」
```

#### TC-BOOK-CREATE-006｜反向：過去時段

```
前提：slot_past
預期：code: BOOKING_SLOT_UNAVAILABLE 或 BOOKING_TOO_SOON, HTTP 409
```

#### TC-BOOK-CREATE-007｜反向：同一使用者重複預約同一時段

```
前提：user_a 已預約 slot_future_2h（確認狀態）
輸入：再次送出相同 availabilitySlotId
預期：code: BOOKING_DUPLICATED, HTTP 409
  【Angular】顯示「你已預約過此時段。」
```

#### TC-BOOK-CREATE-008｜反向：服務已停用（inactive）

```
前提：slot 屬於 service_inactive
預期：code: BOOKING_SLOT_UNAVAILABLE, HTTP 409
```

#### TC-BOOK-CREATE-009｜反向：slot.status = blocked

```
前提：slot_blocked
預期：code: BOOKING_SLOT_UNAVAILABLE, HTTP 409
```

#### TC-BOOK-CREATE-010｜反向：前端傳入 userId 應被忽略

```
輸入：{ availabilitySlotId: "...", userId: user_b.id }
預期：
  - 系統使用 session 中的 user_a.id，忽略傳入的 userId
  - booking.userId = user_a.id（非 user_b.id）
```

#### TC-BOOK-CREATE-011｜Edge：note 為空

```
輸入：{ availabilitySlotId: slot_future_2h.id }（無 note）
預期：成功，booking.note = null
```

#### TC-BOOK-CREATE-012｜前端：Rate Limit 與網路錯誤

```
【Angular】
  - 觸發 RATE_LIMITED → 顯示「操作太頻繁，請稍後再試。」
  - 網路錯誤 → 顯示「系統暫時無法處理請求。」
  - 修正後重新點擊 → 舊錯誤訊息自動清除（錯誤清除機制）
```

---

### 1.10 BookingService — 查詢我的預約

#### TC-BOOK-ME-LIST-001｜Happy Path

```
前提：user_a 有 booking_confirmed_future_5h、booking_cancelled
預期：
  - 只回傳 user_a 的預約
  - 包含 service 與 slot 的嵌套資料
  - 包含分頁 meta
```

#### TC-BOOK-ME-LIST-002｜反向：未登入

```
預期：code: UNAUTHENTICATED, HTTP 401
```

#### TC-BOOK-ME-LIST-003｜Edge：status=completed 篩選

```
前提：booking_completed（slot.endAt 已過，status=confirmed in DB）
輸入：?status=completed
預期：
  - 回傳 booking_completed，對外 status="completed"
  - 不回傳 booking_confirmed_future_5h（尚未結束）
```

#### TC-BOOK-ME-LIST-004｜Edge：status=confirmed 篩選

```
輸入：?status=confirmed
預期：
  - 回傳 booking_confirmed_future_5h
  - 不回傳 booking_completed（slot 已過期）
  - 不回傳 booking_cancelled
```

#### TC-BOOK-ME-LIST-005｜安全：user_b 的預約不出現在 user_a 的列表

```
前提：user_b 有預約
user_a 呼叫 GET /api/me/bookings
預期：只回傳 user_a 的預約
```

---

### 1.11 BookingService — 查詢我的預約詳情

#### TC-BOOK-ME-DETAIL-001｜Happy Path

```
前提：user_a 呼叫，bookingId 屬於 user_a
預期：回傳完整 booking 資料（含 service、slot、cancelReason 等）
```

#### TC-BOOK-ME-DETAIL-002｜反向：查詢他人預約

```
前提：user_a 呼叫，bookingId 屬於 user_b
預期：code: BOOKING_NOT_FOUND, HTTP 404（不透露他人資料存在）
  【Angular】前端導向首頁或列表，或顯示 404
```

#### TC-BOOK-ME-DETAIL-003｜反向：預約不存在

```
輸入：不存在的 bookingId
預期：code: BOOKING_NOT_FOUND, HTTP 404
```

---

### 1.12 BookingService — 取消我的預約

#### TC-BOOK-CANCEL-001｜Happy Path

```
前提：user_a，booking_confirmed_future_5h（startAt=現在+5小時）
輸入：{ reason: "臨時有事" }
預期：
  - booking.status = "cancelled"
  - booking.cancelledBy = "user"
  - booking.cancelReason = "臨時有事"
  - booking.cancelledAt 已設定
  - 寫入 booking_status_logs（from=confirmed, to=cancelled）
  【Angular】取消預約對話框必須提供「取消原因」輸入欄位，送出後狀態更新為已取消
```

#### TC-BOOK-CANCEL-002｜反向：距離開始時間少於 4 小時

```
前提：booking_confirmed_future_3h（startAt=現在+3小時）
預期：code: BOOKING_CANCEL_TOO_LATE, HTTP 409
```

#### TC-BOOK-CANCEL-003｜反向：取消已取消的預約

```
前提：booking_cancelled
預期：code: BOOKING_NOT_CANCELABLE, HTTP 409
```

#### TC-BOOK-CANCEL-004｜反向：取消已完成的預約

```
前提：booking_completed（slot.endAt 已過）
預期：code: BOOKING_NOT_CANCELABLE, HTTP 409
```

#### TC-BOOK-CANCEL-005｜反向：取消他人的預約

```
前提：user_b 嘗試取消 user_a 的預約
預期：code: BOOKING_NOT_FOUND, HTTP 404
```

#### TC-BOOK-CANCEL-006｜反向：未登入取消

```
預期：code: UNAUTHENTICATED, HTTP 401
```

#### TC-BOOK-CANCEL-007｜Edge：4 小時邊界精確

```
Mock 時間：2026-05-21T10:00:00Z
前提：booking.slot.startAt=2026-05-21T14:00:00Z（剛好 4 小時後）
預期：BOOKING_CANCEL_TOO_LATE（需 strictly greater than 4 hours）

前提：booking.slot.startAt=2026-05-21T14:00:01Z（4 小時後 1 秒）
預期：取消成功
```

#### TC-BOOK-CANCEL-008｜Edge：重複取消（並發）

```
前提：user_a 幾乎同時送出兩次取消同一 booking
預期：
  - 一次成功
  - 另一次回 BOOKING_NOT_CANCELABLE
  - booking_status_logs 只寫入一筆 cancelled
```

---

## 2. 後端 API 整合測試（DB / SQL）

> 測試對象：Service + Repository + PostgreSQL
> 隔離策略：每個 test case 使用 Transaction 包裹後回滾

---

### 2.1 Unique Constraint 驗證

#### TC-DB-UNIQUE-001｜時段唯一有效預約

```
SQL 情境：同一 availability_slot_id 插入兩筆 status='confirmed' 的 booking
預期：
  - 第二筆觸發 partial unique index 違反
  - 應拋出 DB constraint 錯誤
  - 後端應轉換為 BOOKING_SLOT_UNAVAILABLE
```

#### TC-DB-UNIQUE-002｜同一會員重複預約同一時段

```
SQL 情境：(user_id, availability_slot_id) 已有 status='confirmed'，再插入一筆
預期：觸發 partial unique index 違反
```

#### TC-DB-UNIQUE-003｜cancelled 後重新預約同一時段

```
SQL 情境：(user_a, slot) 已有 status='cancelled'，再插入一筆 status='confirmed'
預期：成功（cancelled 不受 partial unique index 限制）
```

#### TC-DB-UNIQUE-004｜email 唯一性

```
SQL 情境：插入兩筆相同 email 的 user
預期：觸發 unique constraint 錯誤
```

#### TC-DB-UNIQUE-005｜session_token_hash 唯一性

```
SQL 情境：插入兩筆相同 session_token_hash
預期：觸發 unique constraint 錯誤
```

---

### 2.2 Check Constraint 驗證

#### TC-DB-CHECK-001｜availability_slot.end_at > start_at

```
SQL 情境：end_at = start_at
預期：觸發 check constraint 錯誤

SQL 情境：end_at < start_at
預期：觸發 check constraint 錯誤
```

#### TC-DB-CHECK-002｜services.duration_minutes > 0

```
SQL 情境：duration_minutes = 0
預期：觸發 check constraint 錯誤

SQL 情境：duration_minutes = -1
預期：觸發 check constraint 錯誤
```

#### TC-DB-CHECK-003｜services.price >= 0

```
SQL 情境：price = -100
預期：觸發 check constraint 錯誤

SQL 情境：price = 0
預期：成功（免費服務允許）
```

---

### 2.3 Transaction 與 Race Condition

#### TC-DB-TXN-001｜建立預約時的悲觀鎖

```
情境：
  T1 開始建立預約（鎖定 slot）
  T2 同時嘗試建立相同 slot 的預約
預期：
  - T1 完成後，T2 在 unique constraint 上失敗
  - DB 只有一筆 confirmed booking
  - T1 或 T2 應有穩定的錯誤回應（非 500）
```

#### TC-DB-TXN-002｜建立預約失敗時 booking_status_logs 不寫入

```
情境：建立 booking 成功但 booking_status_log 寫入失敗（模擬 DB 錯誤）
預期：整個 transaction 回滾，booking 也不存在
```

#### TC-DB-TXN-003｜取消預約的原子性

```
情境：booking.status 更新為 cancelled，但 booking_status_log 寫入前發生錯誤
預期：整個 transaction 回滾，booking.status 仍為 confirmed
```

---

### 2.4 Completed 狀態計算

#### TC-DB-COMPLETED-001｜查詢時動態計算 completed

```
SQL 情境：
  booking.status = 'confirmed'（DB 值）
  slot.end_at < 目前時間
Mock 時間：設定為 slot.end_at + 1 小時
預期：
  - API 回傳的 booking.status = "completed"
  - DB 中 booking.status 仍為 "confirmed"
```

#### TC-DB-COMPLETED-002｜status=completed 篩選查詢

```
情境：
  - booking_A：confirmed, slot.end_at=過去
  - booking_B：confirmed, slot.end_at=未來
  - booking_C：cancelled
篩選 status=completed
預期：只回傳 booking_A
```

#### TC-DB-COMPLETED-003｜status=confirmed 排除已完成

```
篩選 status=confirmed
預期：只回傳 booking_B（booking_A 對外是 completed）
```

---

### 2.5 Availability 查詢 SQL 驗證

#### TC-DB-AVAIL-001｜排除已被預約的時段（JOIN 查詢）

```
SQL 情境：
  slot_A：有 confirmed booking
  slot_B：有 cancelled booking（cancelled 不算）
  slot_C：無任何 booking
預期 WHERE 邏輯：
  - slot_A 排除
  - slot_B 包含
  - slot_C 包含
```

#### TC-DB-AVAIL-002｜時間篩選的 UTC 正確性

```
情境：
  時段 startAt=2026-05-21T01:00:00Z（UTC）
  等同台北時間 2026-05-21T09:00:00
  查詢 from=2026-05-21T00:00:00Z to=2026-05-21T02:00:00Z
預期：回傳此時段（在範圍內）
```

---

### 2.6 Audit Log 寫入驗證

#### TC-DB-AUDIT-001｜建立服務後寫入 audit_log

```
情境：Admin 成功呼叫 POST /api/admin/services
預期：
  - audit_logs 有一筆 action="admin.service.create"
  - target_type="service"，target_id=新建服務 ID
  - actor_user_id=admin_a.id
  - metadata 包含服務欄位摘要
```

#### TC-DB-AUDIT-002｜批次產生時段後寫入 audit_log

```
情境：Admin 呼叫 POST /api/admin/availability-slots/bulk-generate
預期：
  - audit_logs 有一筆 action="admin.availability_slot.bulk_generate"
  - metadata 包含 created、skipped 數量
```

#### TC-DB-AUDIT-003｜API 失敗時不應寫入 audit_log

```
情境：Admin 嘗試建立服務，但 validation 失敗
預期：audit_logs 無新增紀錄
```

---

## 3. Admin API 測試

---

### 3.1 AdminService — 服務管理

#### TC-ADMIN-SVC-CREATE-001｜Happy Path

```
前提：admin_a 已登入
輸入：完整服務資料（name, durationMinutes, price, status="active"）
預期：
  - 建立服務成功
  - 寫入 audit_log（action="admin.service.create"）
  - HTTP 201
```

#### TC-ADMIN-SVC-CREATE-002｜反向：一般會員呼叫

```
前提：user_a（role=user）已登入
預期：code: FORBIDDEN, HTTP 403
```

#### TC-ADMIN-SVC-CREATE-003｜反向：未登入

```
預期：code: UNAUTHENTICATED, HTTP 401
```

#### TC-ADMIN-SVC-CREATE-004｜反向：durationMinutes = 0

```
輸入：{ durationMinutes: 0, ... }
預期：VALIDATION_ERROR, HTTP 400
```

#### TC-ADMIN-SVC-UPDATE-001｜Happy Path：將服務設為 inactive

```
前提：service_active
輸入：{ status: "inactive" }
預期：
  - service.status = "inactive"
  - 寫入 audit_log（action="admin.service.update"）
  - 前台仍可查看，但不可預約
```

#### TC-ADMIN-SVC-UPDATE-002｜Happy Path：將服務設為 hidden

```
輸入：{ status: "hidden" }
預期：
  - service.status = "hidden"
  - 公開 API 不再回傳此服務
```

---

### 3.2 AdminService — 時段管理

#### TC-ADMIN-SLOT-CREATE-001｜Happy Path

```
前提：admin_a，service_active
輸入：{ serviceId, startAt=現在+30分鐘, endAt=startAt+60分鐘, status="available" }
預期：
  - 時段建立成功（Admin 不受 1 小時限制）
  - 寫入 audit_log（action="admin.availability_slot.create"）
```

#### TC-ADMIN-SLOT-CREATE-002｜反向：服務為 inactive

```
前提：service_inactive
預期：SERVICE_NOT_ACTIVE, HTTP 409
```

#### TC-ADMIN-SLOT-CREATE-003｜反向：endAt <= startAt

```
輸入：endAt = startAt
預期：INVALID_TIME_RANGE, HTTP 400
```

#### TC-ADMIN-SLOT-CREATE-004｜反向：時段長度不符服務 durationMinutes

```
前提：service.durationMinutes = 60
輸入：startAt 到 endAt 相差 30 分鐘
預期：VALIDATION_ERROR 或 INVALID_TIME_RANGE, HTTP 400
```

---

### 3.3 AdminService — 批次產生時段

#### TC-ADMIN-BULK-001｜Happy Path

```
前提：service_active（durationMinutes=60）
輸入：{
  serviceId, timezone="Asia/Taipei",
  dateFrom="2026-06-01", dateTo="2026-06-07",
  weekdays=[1,2,3,4,5],
  timeRanges=[{ startTime:"09:00", endTime:"12:00" }]
}
預期：
  - 生成 5天 × 3個時段 = 15 筆 availability_slots
  - created=15, skipped=0
  - 時間正確轉換為 UTC 儲存
  - 寫入 audit_log（action="admin.availability_slot.bulk_generate"）
```

#### TC-ADMIN-BULK-002｜Edge：已存在的時段跳過

```
前提：部分時段已存在
預期：
  - 已存在的跳過（skipped > 0）
  - 不重複建立
  - 已存在的不更新
```

#### TC-ADMIN-BULK-003｜Edge：timezone 轉換 UTC 正確

```
輸入：台北時間 09:00（Asia/Taipei）
預期：DB 儲存 UTC+8 偏移後的時間（01:00 UTC）
```

#### TC-ADMIN-BULK-004｜反向：服務為 inactive

```
前提：service_inactive
預期：SERVICE_NOT_ACTIVE, HTTP 409
```

#### TC-ADMIN-BULK-005｜反向：timeRanges 格式錯誤

```
輸入：timeRanges=[{ startTime:"25:00", endTime:"26:00" }]
預期：INVALID_TIME_RANGE, HTTP 400
```

#### TC-ADMIN-BULK-006｜反向：dateFrom 晚於 dateTo

```
輸入：dateFrom="2026-06-07", dateTo="2026-06-01"
預期：INVALID_TIME_RANGE 或 VALIDATION_ERROR, HTTP 400
```

#### TC-ADMIN-BULK-007｜反向：weekdays 無符合日期

```
輸入：weekdays=[7]（僅週日），dateFrom/dateTo 只涵蓋週一到週五
預期：created=0, skipped=0（無錯誤，只是沒有產生）
```

---

### 3.4 AdminService — Admin 建立預約

#### TC-ADMIN-BOOK-CREATE-001｜Happy Path：代替會員建立

```
前提：admin_a，slot_future_30m（startAt=現在+30分鐘）
輸入：{ userId: user_a.id, availabilitySlotId: slot_future_30m.id }
預期：
  - 成功建立（Admin 不受 1 小時限制）
  - 寫入 booking_status_logs
  - 寫入 audit_log（action="admin.booking.create"）
  【Angular】後台建立預約對話框：選取會員後查詢 API 顯示顯示名稱，確認所有必填欄位後「確認建立」才啟用
```

#### TC-ADMIN-BOOK-CREATE-002｜反向：時段已被預約

```
前提：slot_booked
預期：BOOKING_SLOT_UNAVAILABLE, HTTP 409
```

#### TC-ADMIN-BOOK-CREATE-003｜反向：一般會員呼叫此 API

```
前提：user_a（role=user）
預期：FORBIDDEN, HTTP 403
```

---

### 3.5 AdminService — Admin 取消預約

#### TC-ADMIN-BOOK-CANCEL-001｜Happy Path：不受時間限制

```
前提：admin_a，booking_confirmed_future_3h（startAt=現在+3小時）
預期：
  - 成功取消（Admin 不受 4 小時限制）
  - cancelledBy = "admin"
  - 寫入 booking_status_logs
  - 寫入 audit_log（action="admin.booking.cancel"）
```

#### TC-ADMIN-BOOK-CANCEL-002｜反向：取消已取消的預約

```
前提：booking_cancelled
預期：BOOKING_NOT_CANCELABLE, HTTP 409
```

#### TC-ADMIN-BOOK-CANCEL-003｜反向：取消已完成的預約

```
前提：booking_completed（slot.endAt 已過）
預期：BOOKING_NOT_CANCELABLE, HTTP 409
```

#### TC-ADMIN-BOOK-CANCEL-004｜反向：一般會員呼叫此 API

```
預期：FORBIDDEN, HTTP 403
```

---

### 3.6 AdminService — 稽核紀錄

#### TC-ADMIN-AUDIT-LIST-001｜Happy Path

```
前提：admin_a 已登入，DB 有多筆 audit_logs
預期：
  - 回傳分頁 audit_log 列表
  - 包含 actorUserId、action、targetType、targetId、metadata
```

#### TC-ADMIN-AUDIT-LIST-002｜反向：一般會員無法查看

```
前提：user_a（role=user）
預期：FORBIDDEN, HTTP 403
```

#### TC-ADMIN-AUDIT-LIST-003｜Edge：篩選 actorUserId

```
輸入：?actorUserId=admin_a.id
預期：只回傳 admin_a 的操作紀錄
```

---

## 4. Rate Limit 測試

---

### 4.1 登入 Rate Limit

#### TC-RATE-LOGIN-001｜超過限制後回 429

```
情境：同一 IP + email 在 10 分鐘內登入 6 次（第 6 次觸發）
預期：第 6 次回 code: RATE_LIMITED, HTTP 429
  - 錯誤訊息不透露帳號是否存在
  【Angular】顯示「登入太頻繁，請稍後再試。」
```

#### TC-RATE-LOGIN-002｜不同 IP 不共享計數

```
情境：IP_A 已達限制，IP_B 使用相同 email 登入
預期：IP_B 正常登入（獨立計數）
```

---

### 4.2 註冊 Rate Limit

#### TC-RATE-REG-001｜同 IP 超過 5 次觸發限制

```
情境：同一 IP 在 10 分鐘內嘗試 6 次註冊
預期：第 6 次回 RATE_LIMITED, HTTP 429
```

---

### 4.3 建立 / 取消預約 Rate Limit

#### TC-RATE-BOOK-001｜建立預約超過每分鐘 5 次

```
情境：user_a 在 1 分鐘內建立 6 次預約（第 6 次觸發）
預期：第 6 次回 RATE_LIMITED，資料庫無新增 booking
```

#### TC-RATE-BOOK-002｜取消預約超過每分鐘 5 次

```
情境：user_a 在 1 分鐘內取消 6 次（第 6 次觸發）
預期：第 6 次回 RATE_LIMITED，不應有 booking 狀態變更
```

---

### 4.4 Public API Rate Limit

#### TC-RATE-PUBLIC-001｜超過每分鐘 120 次

```
情境：同一 IP 在 1 分鐘內呼叫 121 次 GET /api/services
預期：第 121 次回 RATE_LIMITED, HTTP 429
```

---

### 4.5 Admin API Rate Limit

#### TC-RATE-ADMIN-001｜超過每分鐘 60 次

```
情境：admin_a 在 1 分鐘內呼叫 Admin API 61 次
預期：第 61 次回 RATE_LIMITED
  - Admin API 仍需先通過 role=admin 檢查後才觸發 rate limit（權限優先）
```

---

## 5. 資安測試

---

### 5.1 越權存取

#### TC-SEC-AUTHZ-001｜會員存取 Admin API

```
前提：user_a（role=user）
呼叫：GET /api/admin/services
預期：FORBIDDEN, HTTP 403
```

#### TC-SEC-AUTHZ-002｜直接修改 URL 查看他人預約（IDOR）

```
前提：user_a 已登入
呼叫：GET /api/me/bookings/[user_b 的 booking ID]
預期：BOOKING_NOT_FOUND, HTTP 404（不透露他人資料存在）
  【Angular E2E】登入會員 A 後，直接以網址輸入會員 B 的預約詳情頁 URL（/my/bookings/booking-B-id）
  預期跳轉回首頁/列表或顯示權限不足，絕不可展示會員 B 的預約內容與天氣資訊
```

#### TC-SEC-AUTHZ-003｜偽造 session cookie

```
前提：攜帶偽造或不存在的 session token
呼叫：GET /api/auth/me
預期：UNAUTHENTICATED, HTTP 401
```

#### TC-SEC-AUTHZ-004｜前端傳入 userId 嘗試偽裝身份

```
前提：user_a 已登入
輸入：POST /api/bookings，body 含 userId: admin_a.id
預期：
  - userId 被忽略
  - booking.userId = user_a.id（非 admin_a.id）
```

#### TC-SEC-AUTHZ-005｜Session 過期後操作（前端層）

```
【Angular E2E】
  1. 開啟預約詳情頁，手動清除 LocalStorage/Cookie 的 Token 模擬過期狀態
  2. 點選「加入日曆」或操作選單
  3. 確認 API 回傳 401 時，系統能平滑導回登入頁，且 URL 帶有當前頁面的 redirect path
```

#### TC-SEC-AUTHZ-006｜Route Guard 穿透測試（前端層）

```
【Angular E2E】
  - 未登入狀態直接輸入 /admin/bookings → 確認被 Route Guard 擋下並強行重導向至後台登入頁
  - 一般會員權限登入後，嘗試直接輸入 /admin/bookings → 確認被擋下並提示權限不足
```

---

### 5.2 密碼安全

#### TC-SEC-PWD-001｜密碼不以明文儲存

```
情境：user_a 註冊後直接查詢 DB
預期：
  - users.password_hash 為 argon2id hash 格式
  - 無法從 hash 反推原始密碼
```

#### TC-SEC-PWD-002｜API 回應不含密碼相關欄位

```
呼叫：GET /api/auth/me、POST /api/auth/register
預期：
  - 回應 JSON 中不含 password、passwordHash、password_hash
```

---

### 5.3 Session 安全

#### TC-SEC-SESSION-001｜DB 只儲存 session token hash

```
情境：登入後查詢 sessions 表
預期：session_token_hash 為 hash 值，非明文 token
```

#### TC-SEC-SESSION-002｜登出後 session 失效

```
情境：
  1. user_a 登入，取得 Cookie
  2. 呼叫 POST /api/auth/logout
  3. 使用同一 Cookie 呼叫 GET /api/auth/me
預期：第三步回 UNAUTHENTICATED, HTTP 401
```

#### TC-SEC-SESSION-003｜過期 session 不可使用

```
情境：session.expires_at 設為過去時間
呼叫：任何需要登入的 API
預期：UNAUTHENTICATED, HTTP 401
```

---

### 5.4 錯誤資訊不洩漏

#### TC-SEC-LEAK-001｜登入失敗不透露帳號是否存在

```
情境A：正確 email + 錯誤密碼
情境B：不存在的 email + 任意密碼
預期：兩者回傳相同錯誤碼（INVALID_CREDENTIALS）與相同 HTTP 狀態（401）
  回應 body 中 message 文字應相同或相似
```

#### TC-SEC-LEAK-002｜查詢 hidden 服務不透露存在

```
呼叫：GET /api/services/[service_hidden.id]
預期：SERVICE_NOT_FOUND, HTTP 404
  與不存在服務的回應行為一致
```

---

## 6. 前端函式單元測試

---

### 6.1 日期時間工具函式

#### TC-FE-DATE-001｜formatLocalTime：UTC 轉本地時區顯示

```
輸入：ISO 8601 UTC 字串、使用者時區 "Asia/Taipei"
預期：顯示正確的台北時間（UTC+8）
```

#### TC-FE-DATE-002｜isCancelable：4 小時邊界判斷

```
輸入：startAt = 現在 + 5 小時
預期：true

輸入：startAt = 現在 + 3 小時
預期：false

輸入：startAt = 現在 + 4 小時（邊界）
預期：false（應 strictly greater than 4 hours）
```

#### TC-FE-DATE-003｜isBookable：1 小時邊界判斷

```
輸入：startAt = 現在 + 2 小時
預期：true

輸入：startAt = 現在 + 30 分鐘
預期：false
```

#### TC-FE-DATE-004｜formatDate：跨日顯示正確

```
輸入：UTC 00:00:00（台北時間 08:00），顯示日期
預期：顯示台北時間的日期（非 UTC 日期）
```

---

### 6.2 Zod Schema 驗證

#### TC-FE-ZOD-001｜RegisterSchema：有效輸入

```
輸入：{ email: "test@example.com", password: "Pass123!", displayName: "測試" }
預期：parse 成功，無 error
```

#### TC-FE-ZOD-002｜RegisterSchema：email 格式錯誤

```
輸入：{ email: "not-an-email", ... }
預期：parse 失敗，errors 含 email 相關訊息
```

#### TC-FE-ZOD-003｜BookingFormSchema：缺少 availabilitySlotId

```
輸入：{}
預期：parse 失敗
```

#### TC-FE-ZOD-004｜BulkGenerateSchema：timeRanges 驗證

```
輸入：timeRanges=[{ startTime:"09:00", endTime:"08:00" }]（結束早於開始）
預期：parse 失敗
```

---

### 6.3 API Client

#### TC-FE-API-001｜成功回應解析 data

```
Mock fetch 回傳：{ data: { id: "uuid" } }
呼叫：apiClient.get("/services/uuid")
預期：回傳 { id: "uuid" }
```

#### TC-FE-API-002｜401 自動導向登入

```
Mock fetch 回傳：401 + { error: { code: "UNAUTHENTICATED" } }
預期：觸發 router.push("/login")
```

#### TC-FE-API-003｜409 回傳結構化錯誤

```
Mock fetch 回傳：409 + { error: { code: "BOOKING_SLOT_UNAVAILABLE" } }
預期：拋出帶有 code="BOOKING_SLOT_UNAVAILABLE" 的錯誤物件
```

#### TC-FE-API-004｜網路錯誤處理

```
Mock fetch：reject（模擬網路斷線）
預期：拋出包含 code="NETWORK_ERROR" 的錯誤（不應 crash 或靜默失敗）
```

---

### 6.4 Auth 狀態管理

#### TC-FE-AUTH-001｜初始狀態為 loading

```
建立 AuthProvider 前
預期：authStatus = "loading"
```

#### TC-FE-AUTH-002｜GET /api/auth/me 成功後更新狀態

```
Mock GET /api/auth/me 回傳 user_a
預期：authStatus = "authenticated"，currentUser = user_a
```

#### TC-FE-AUTH-003｜GET /api/auth/me 回 401 時設為 unauthenticated

```
Mock GET /api/auth/me 回傳 401
預期：authStatus = "unauthenticated"，currentUser = null
```

#### TC-FE-AUTH-004｜登出後清除 currentUser

```
情境：currentUser 已設定，呼叫 logout()
Mock POST /api/auth/logout 成功
預期：currentUser = null，authStatus = "unauthenticated"
```

---

## 7. UI 元件測試

---

### 7.1 服務卡片元件

#### TC-UI-SVC-001｜active 服務顯示可預約按鈕

```
Props：service（status="active"）
預期：
  - 顯示服務名稱、價格、時長
  - 顯示「立即預約」按鈕，且可點擊
  【Angular】Inactive 服務卡片上應清晰標示「暫停預約」
```

#### TC-UI-SVC-002｜inactive 服務顯示停用標籤

```
Props：service（status="inactive"）
預期：
  - 顯示「目前不可預約」標籤
  - 預約按鈕不顯示或 disabled
```

#### TC-UI-SVC-003｜服務列表狀態顯示過濾

```
【Angular】
  - Active 與 Inactive 服務顯示在列表上
  - Hidden 服務不得出現在公開列表中
```

---

### 7.2 時段選擇元件

#### TC-UI-SLOT-001｜可預約時段清單

```
Props：slots=[slot_future_2h]
預期：
  - 顯示 slot_future_2h 的時間（依使用者時區）
  - 可選擇
```

#### TC-UI-SLOT-002｜空列表顯示 empty state

```
Props：slots=[]
預期：顯示「目前沒有可預約時段，請稍後再回來查看。」
```

---

### 7.3 預約確認對話框

#### TC-UI-BOOKING-001｜確認後 disable 按鈕避免重複送出

```
情境：使用者點擊確認預約
預期：
  - 送出期間按鈕變為 disabled / loading 狀態
  - 不允許重複點擊
  【Angular】按鈕應呈現「建立中...」
```

#### TC-UI-BOOKING-002｜成功後導向我的預約

```
Mock POST /api/bookings 成功
預期：router.push 呼叫 /my/bookings/:bookingId（含 ?promptCalendar=1）
```

#### TC-UI-BOOKING-003｜BOOKING_SLOT_UNAVAILABLE 顯示提示並刷新

```
Mock POST /api/bookings 回 409 BOOKING_SLOT_UNAVAILABLE
預期：
  - 顯示「此時段目前不可預約，請重新整理後選擇其他時段。」
  - 觸發 availability 重新查詢
```

---

### 7.4 取消預約元件

#### TC-UI-CANCEL-001｜顯示取消按鈕：4 小時後可取消

```
Props：booking（startAt=現在+5小時）
預期：取消按鈕可見且可點擊
```

#### TC-UI-CANCEL-002｜隱藏或 disable：距開始不足 4 小時

```
Props：booking（startAt=現在+2小時）
預期：取消按鈕 disabled 或不顯示，並說明原因
```

#### TC-UI-CANCEL-003｜已取消的預約不顯示取消按鈕

```
Props：booking（status="cancelled"）
預期：取消按鈕不顯示
```

---

### 7.5 Admin Route Guard

#### TC-UI-ADMIN-001｜未登入導向登入頁

```
情境：authStatus="unauthenticated"，進入 /admin
預期：redirect 到 /login
```

#### TC-UI-ADMIN-002｜role=user 顯示無權限

```
情境：authStatus="authenticated"，currentUser.role="user"，進入 /admin
預期：顯示「無權限」訊息，或 redirect
  不應顯示後台內容
```

#### TC-UI-ADMIN-003｜authStatus=loading 顯示 loading

```
情境：authStatus="loading"
預期：顯示 loading 狀態，不做 redirect
```

---

### 7.6 批次產生時段表單

#### TC-UI-BULK-001｜送出後 disable submit button

```
情境：送出 bulk-generate 中
預期：submit button 為 disabled / loading
```

#### TC-UI-BULK-002｜成功後顯示 created / skipped 統計

```
Mock 回傳：{ data: { created: 15, skipped: 2 } }
預期：
  - 顯示「成功建立 15 筆時段」
  - 顯示「已略過 2 筆（已存在）」
```

#### TC-UI-BULK-003｜durationMinutes 唯讀顯示

```
情境：選擇 service_active（durationMinutes=60）
預期：
  - 顯示「每段時長：60 分鐘」
  - 不提供 durationMinutes 輸入欄位
  - 不在 request body 中傳送 durationMinutes
```

---

### 7.7 預約詳情頁（Booking Detail）

#### TC-UI-DETAIL-001｜加入日曆按鈕

```
【Angular】
  - 詳情頁面常駐「加入日曆」按鈕
  - 點擊後觸發 .ics 檔案下載
```

#### TC-UI-DETAIL-002｜首度預約完成提示（Prompt Calendar）

```
【Angular】
  - 網址攜帶 ?promptCalendar=1 → 頁面載入時自動彈出「是否加入日曆？」對話框
  - 對話框彈出後，應立即使用 Router 將網址參數清除（改為 /my/bookings/:bookingId）
  - 避免使用者手動重新整理時，對話框重複彈出
```

#### TC-UI-DETAIL-003｜當日天氣資訊預報（Weather Widget）

```
【Angular】
  載入狀態：天氣資料尚未回傳前，顯示「正在載入天氣...」

  成功載入：
  - 正確解析 API 資料
  - 顯示預約日期當天的天氣描述（晴、雨等）、平均溫度、以及預約地點

  超出預報範圍（3天限制）：
  - API 回傳 null → 天氣區塊顯示「目前僅提供近 3 日天氣預報，請出發前再查看。」

  天氣 API 故障容錯（502 / WEATHER_UPSTREAM_ERROR）：
  - 天氣區塊顯示「暫時無法取得天氣，請稍後再試。」
  - 但不應阻礙詳情頁面其他基本預約資料（服務資訊、加入日曆等）的正常顯示
```

---

### 7.8 後台預約日曆與列表（Admin Bookings Calendar）

#### TC-UI-ADMIN-CAL-001｜分頁過濾功能

```
【Angular】
  - 預約清單分為「一般」與「已取消」兩個 Tab
  - 「一般」分頁包含 confirmed、pending 等非取消狀態的預約
  - 「已取消」分頁只顯示 cancelled 的預約單
```

#### TC-UI-ADMIN-CAL-002｜月份切換

```
【Angular】
  - 點擊「上個月 / 下個月」能正常切換
  - 同步更新網址 query 參數（如 ?month=2026-07）
  - 重新整理後仍停留在該月份
```

---

## 8. E2E 測試

---

### 8.1 訪客流程

#### TC-E2E-GUEST-001｜訪客瀏覽服務列表

```
步驟：
  1. 開啟 /services
  2. 確認列表顯示 service_active、service_inactive
  3. 確認 service_hidden 不在列表中
  4. 確認 service_inactive 有停用標示
```

#### TC-E2E-GUEST-002｜訪客查看服務詳情與可預約時段

```
步驟：
  1. 點擊 service_active 進入 /services/:serviceId
  2. 確認服務名稱、價格、時長、描述顯示正確
  3. 確認顯示未來可預約時段列表
  4. 確認不顯示過去時段
```

#### TC-E2E-GUEST-003｜訪客點擊預約被導向登入

```
步驟：
  1. 進入 /services/:serviceId
  2. 點擊預約按鈕
  3. 確認導向 /login?redirect=/services/:serviceId
  4. 登入後確認回到服務詳情頁
```

#### TC-E2E-GUEST-004｜訪客直接訪問 /my/bookings

```
步驟：
  1. 未登入狀態，直接開啟 /my/bookings
  2. 確認導向 /login
```

#### TC-E2E-GUEST-005｜訪客直接訪問 /admin

```
步驟：
  1. 未登入狀態，直接開啟 /admin
  2. 確認導向 /login 或顯示無權限
```

---

### 8.2 會員完整預約流程

#### TC-E2E-MEMBER-001｜註冊 → 登入 → 建立預約 → 查看我的預約

```
步驟：
  1. 開啟 /register，填入資料並提交
  2. 確認導向 /login
  3. 登入
  4. 前往 /services/:serviceId
  5. 選擇可預約時段
  6. 確認預約
  7. 確認導向 /my/bookings/:bookingId（含 ?promptCalendar=1）
  8. 確認預約詳情顯示正確（服務名稱、時段、status=confirmed）
  9. 確認「是否加入日曆？」對話框自動彈出（一次性）
```

#### TC-E2E-MEMBER-002｜我的預約列表只顯示自己的資料

```
步驟：
  1. user_b 登入並建立一筆預約
  2. user_a 登入，前往 /my/bookings
  3. 確認不顯示 user_b 的預約
```

#### TC-E2E-MEMBER-003｜預約已完成（completed）顯示正確狀態

```
前提：booking_completed（slot.endAt 在過去）
步驟：
  1. user_a 登入，前往 /my/bookings
  2. 選擇 status=completed 篩選
  3. 確認顯示此筆預約，狀態為「已完成」
  4. 確認無取消按鈕
```

---

### 8.3 會員取消預約流程

#### TC-E2E-CANCEL-001｜會員成功取消預約

```
前提：user_a 有 booking_confirmed_future_5h
步驟：
  1. user_a 登入，前往 /my/bookings/:bookingId
  2. 點擊取消預約
  3. 輸入取消原因並確認
  4. 確認頁面更新為「已取消」狀態
  5. 確認原先的時段再次出現在可預約列表（availability 刷新）
```

#### TC-E2E-CANCEL-002｜不足 4 小時的預約不顯示取消按鈕

```
前提：user_a 有 booking_confirmed_future_3h
步驟：
  1. 前往 /my/bookings/:bookingId
  2. 確認取消按鈕不可用或顯示說明文字
```

---

### 8.4 後台管理流程

#### TC-E2E-ADMIN-001｜Admin 管理服務（建立 → 停用 → 隱藏）

```
步驟：
  1. admin_a 登入，前往 /admin/services
  2. 建立新服務（填入所有欄位）
  3. 確認服務出現在列表
  4. 前往 /services（前台），確認新服務可見
  5. 回到後台，將服務設為 inactive
  6. 前台確認服務顯示停用標示
  7. 回到後台，將服務設為 hidden
  8. 前台確認服務不再顯示
```

#### TC-E2E-ADMIN-002｜Admin 批次產生時段

```
步驟：
  1. admin_a 前往 /admin/availability
  2. 選擇 service_active，設定日期範圍、星期與時間區間
  3. 提交批次產生
  4. 確認顯示 created / skipped 統計
  5. 重新整理時段列表，確認新時段出現
```

#### TC-E2E-ADMIN-003｜Admin 代替會員建立預約

```
步驟：
  1. admin_a 前往 /admin/bookings
  2. 點擊「建立預約」
  3. 輸入 user_a、選擇 slot_future_30m
  4. 確認成功（Admin 不受 1 小時限制）
  5. 前台 user_a 的 /my/bookings 確認此預約出現
```

#### TC-E2E-ADMIN-004｜Admin 取消預約（無時間限制）

```
步驟：
  1. admin_a 前往 /admin/bookings
  2. 取消 booking_confirmed_future_3h（僅 3 小時後）
  3. 確認成功取消（Admin 不受 4 小時限制）
  4. 確認稽核紀錄有此筆操作
```

#### TC-E2E-ADMIN-005｜稽核紀錄可查詢

```
步驟：
  1. Admin 執行數筆操作（建立服務、批次時段、取消預約）
  2. 前往 /admin/audit-logs
  3. 確認操作均有對應紀錄
  4. 依 actorUserId 篩選，確認過濾正確
```

---

### 8.5 競爭條件（Race Condition）E2E

#### TC-E2E-RACE-001｜兩位使用者同時搶同一時段

```
步驟：
  1. user_a 與 user_b 同時在瀏覽器中選擇同一 slot
  2. 同時送出建立預約
  3. 確認：
     - 只有一位成功（booking 建立）
     - 另一位收到 BOOKING_SLOT_UNAVAILABLE
     - DB 只有一筆 confirmed booking
     - 成功者的預約詳情顯示正確
```

---

### 8.6 錯誤流程 E2E

#### TC-E2E-ERR-001｜預約失敗後時段刷新

```
步驟：
  1. user_a 正在服務詳情頁選擇 slot
  2. user_b 在後台取消此 slot（設為 blocked）
  3. user_a 送出預約
  4. 確認：
     - 收到 BOOKING_SLOT_UNAVAILABLE 提示
     - 可預約時段列表重新整理
     - 該時段不再顯示
```

#### TC-E2E-ERR-002｜session 過期後操作

```
步驟：
  1. user_a 已登入
  2. 手動讓 session 過期（修改 DB 或等待）
  3. user_a 嘗試建立預約
  4. 確認：
     - 前端收到 401，導向 /login
     - 預約未建立
```

---

## 9. QA 真實情境（Angular 前端驗收）

> 此章節為 Angular 前端 QA 驗收專屬項目，著重真實使用情境下的邊緣行為。

---

### 9.1 請求防重複送出（Debounce / Disable）

| # | 功能 | 驗收標準 |
|---|------|---------|
| QA-DBL-001 | 會員註冊 | 點擊後按鈕呈現「註冊中...」並停用；若失敗顯示錯誤，修改後再次點擊應先清除舊訊息 |
| QA-DBL-002 | 會員登入 | 點擊後按鈕呈現「登入中...」並停用；再次點擊前清除舊錯誤訊息 |
| QA-DBL-003 | 建立預約 | 點擊後按鈕呈現「建立中...」並停用，避免重複送出 |

---

### 9.2 網路不穩定與邊緣案例

#### QA-NET-001｜極端延遲與連續點擊防護（Race Condition）

```
情境：慢速網路（Slow 3G）下，測試「預約」、「登入」、「註冊」按鈕
驗收：確實只送出一次請求

情境：頻繁點擊分頁切換
驗收：前端因非同步 API 回傳順序不一（Race Condition），不應顯示錯誤的月份或時段資料
  應以最後一次請求為準，或阻斷前次請求
```

#### QA-NET-002｜完全斷網環境（Offline）

```
情境：離線狀態下，點擊各操作按鈕
驗收：有顯著的斷網錯誤提示，而非頁面卡死或控制台噴錯
  顯示「系統暫時無法處理請求。」
```

---

### 9.3 時間與時區相容性

#### QA-TZ-001｜跨時區預約時間正確性

```
情境：使用者系統時區非台灣時間（例如東京 UTC+9、美東 UTC-5）
驗收：預約顯示的時間正確轉換，不因時區偏移而發生顯示日期或小時錯誤
```

#### QA-TZ-002｜時間邊界臨界點

```
情境：台灣時間 12:00:00，時段 13:00:00
驗收：13:00:00 應為可預約邊界（需 strictly greater than 1 hour，故 13:00:00 不可預約）
  12:59:59 的時段應不予顯示或在送出時被阻擋

情境：跨月、跨年時間點
驗收：日曆換月顯示與 API parameters 的年份計算正確
```

---

### 9.4 響應式佈局與裝置體驗

#### QA-RWD-001｜日曆於行動裝置之可用性

```
裝置：iPhone SE（375px 寬度）
驗收：
  - 日曆格線不應重疊擠壓
  - 日期數字與預約點標記易於手指點擊
```

#### QA-RWD-002｜加入日曆按鈕在行動裝置之行為

```
裝置：iOS Safari、Android Chrome
驗收：
  - 點擊「加入日曆」下載 .ics
  - 能被系統預設日曆應用程式（Apple Calendar、Google Calendar）正常開啟並解析
```

---

## 10. 測試優先順序建議

| 優先級 | 情境類型 | 原因 |
| --- | --- | --- |
| P0（必測） | 建立預約的 race condition 與 unique constraint | 核心業務一致性風險 |
| P0（必測） | 越權存取（AUTHZ）系列，含 IDOR 與 Route Guard | 資安邊界 |
| P0（必測） | 時間邊界（1 小時 / 4 小時）業務規則 | 常見糾紛點 |
| P1（高優） | 登入 / 登出 / session 安全 | 認證基礎 |
| P1（高優） | Admin vs Member API 隔離 | 角色邊界 |
| P1（高優） | Completed 狀態計算（查詢時計算） | 非明顯邏輯 |
| P1（高優） | 請求防重複送出（前端 Debounce） | 防止資料髒寫 |
| P2（中優） | Rate Limit 行為 | 防護性測試 |
| P2（中優） | Audit Log 寫入完整性 | 可追蹤性 |
| P2（中優） | 前端 Zod 驗證 + 錯誤碼對應顯示 | UX 穩定性 |
| P2（中優） | 天氣 Widget 容錯（不阻礙主流程） | 降級設計驗收 |
| P3（低優） | 分頁邊界、empty state | 邊緣情況 |
| P3（低優） | 跨時區顯示正確性 | 環境依賴 |
| P3（低優） | 行動裝置 RWD / .ics 相容性 | 裝置依賴 |

---

## 11. 不在本次測試範圍

- 線上付款流程（非 MVP）
- Email / SMS 通知（非 MVP）
- WebSocket 即時更新（非 MVP）
- DST（日光節約時間）邊界（Asia/Taipei 無 DST，暫不處理）
- 圖片上傳（非 MVP）
- 多店家 / 多租戶（非 MVP）
