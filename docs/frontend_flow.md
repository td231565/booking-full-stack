# 預約排程系統前端頁面與串接流程

## 1. 文件目標

本文件定義預約排程系統 MVP 的前端頁面、Next.js 路由、API 串接流程、登入狀態處理、錯誤處理與前端風險控管。

前端技術選型：

- Next.js
- TypeScript
- React Server Components
- Client Components
- TanStack Query 或 SWR
- Zod
- Tailwind CSS

## 2. Next.js 架構原則

建議使用 App Router。

頁面資料取得原則：

- 公開服務頁可使用 Server Component 取得資料
- 公開服務列表可依需求使用快取或短時間 revalidate
- 服務可預約時段變動較頻繁，建議使用動態查詢或短時間 revalidate
- 會員頁與後台頁不可使用共享快取
- 會員與後台資料需依 session 判斷，建議使用 `cache: 'no-store'`
- 互動表單、登入、預約、取消預約使用 Client Component
- 後台與公開站版面分離：`/admin/*` 不顯示公開站 header，使用獨立 sidebar + status bar

資料安全原則：

- 前端不讀取 HttpOnly Cookie
- 前端不保存 access token 到 localStorage
- 前台登入狀態以 `GET /api/auth/me`（`booking_member_session`）為準
- 後台登入狀態以 `GET /api/admin/auth/me`（`booking_admin_session`）為準；兩者互不干擾
- 前端 route guard 只改善 UX，真正權限由後端 API 驗證

## 3. 建議路由結構

### 3.1 公開站與會員頁

```text
app/
  layout.tsx              # 根 layout（含 SiteHeader，/admin 不顯示）
  page.tsx
  services/
    page.tsx
    [serviceId]/
      page.tsx
  login/
    page.tsx
  register/
    page.tsx
  my/
    bookings/
      page.tsx
      [bookingId]/
        page.tsx
```

### 3.2 後台（獨立路由，無公開站 header）

後台使用 Route Group 分離登入頁與 dashboard，URL 不含 group 名稱：

```text
app/admin/
  (auth)/
    login/
      page.tsx              # /admin/login
      admin-login-form.tsx  # Client Component
  (dashboard)/
    layout.tsx              # sidebar + status bar + auth guard
    page.tsx                # /admin → redirect /admin/bookings
    bookings/
      page.tsx              # /admin/bookings（預設首頁）
    services/
      page.tsx
    availability/
      page.tsx
    audit-logs/
      page.tsx
```

後台入口：**無公開站導覽連結**，須直接前往 `/admin/login`。

### 3.3 建議共用模組

```text
src/
  app/
    admin/
      (auth)/login/
      (dashboard)/
  components/
    ui/
    admin/                  # sidebar、status bar、logout、nav 設定
    site-header.tsx         # 公開站 header（pathname 以 /admin 開頭時不渲染）
  lib/
    api/
    auth/                   # getCurrentMemberUser、getCurrentAdminUser、getCurrentUserFromCookieHeader
    admin/                  # admin-api.ts
    services/
    bookings/
```

> 原規劃的 `features/` 目錄尚未採用，目前以 `app/` + `lib/` + `components/` 組織。

## 4. 共用前端狀態

### 4.1 Auth 狀態

建議狀態：

```text
authStatus = "loading" | "authenticated" | "unauthenticated"
currentUser = User | null
```

初始化流程：

```text
1. App 載入或進入需要登入的頁面
2. 前台頁呼叫 GET /api/auth/me；後台 dashboard 呼叫 GET /api/admin/auth/me
3. 成功時設定 currentUser
4. 401 時視為未登入
```

注意：

- Cookie 是 HttpOnly，前端不直接讀 token
- 不要把 user role 當成安全邊界
- 後台 layout 僅認 admin session；僅 member 登入的 admin 帳號仍會被導向 `/admin/login`
- Admin API 仍必須由後端檢查 admin session 與 `role = admin`

### 4.2 API 錯誤狀態

前端應依 API `error.code` 顯示穩定訊息。

常見對應：

| error.code | 前端處理 |
| --- | --- |
| UNAUTHENTICATED | 會員頁導向 `/login`；後台頁由 layout redirect 至 `/admin/login` |
| FORBIDDEN | 顯示無權限；後台列表頁可能顯示「你沒有後台管理權限。」（API 層） |
| RESOURCE_NOT_FOUND | 顯示找不到資料 |
| BOOKING_SLOT_UNAVAILABLE | 顯示時段已不可預約並刷新時段 |
| BOOKING_TOO_SOON | 顯示只能預約 1 小時後的時段 |
| BOOKING_CANCEL_TOO_LATE | 顯示少於 4 小時不可取消 |
| RATE_LIMITED | 顯示操作太頻繁 |

## 5. Public Pages

### 5.1 首頁 `/`

用途：

- 顯示產品簡介
- 顯示部分公開服務
- 導向服務列表

串接 API：

```text
GET /api/services?page=1&pageSize=6
```

資料規則：

- 顯示 `active` 與 `inactive`
- 不會取得 `hidden`
- `inactive` 需標示目前不可預約

渲染建議：

- 可使用 Server Component
- 可使用短時間 revalidate
- 不應載入會員私人資料

### 5.2 服務列表 `/services`

用途：

- 顯示所有公開服務
- 支援分頁
- 點擊服務進入詳情頁

串接 API：

```text
GET /api/services?page=1&pageSize=20
```

前端狀態：

- loading
- empty
- error
- pagination

UI 規則：

- `active` 顯示可預約狀態
- `inactive` 顯示停用標籤與不可預約說明
- `hidden` 不會出現在列表

### 5.3 服務詳情 `/services/:serviceId`

用途：

- 顯示服務名稱、主圖、說明、價格、時長、狀態
- 顯示可預約時段
- 使用者選擇時段後建立預約

串接 API：

```text
GET /api/services/:serviceId
GET /api/services/:serviceId/availability?from=...&to=...
```

狀態規則：

- `active`：顯示可預約時段與預約按鈕
- `inactive`：顯示服務內容，但不可預約
- `hidden`：公開 API 不回傳，前端顯示 404 或找不到服務

互動規則：

- 選擇時段後，若未登入，導向 `/login?redirect=/services/:serviceId`
- 若已登入，顯示確認預約表單
- 送出期間 disable 預約按鈕
- 成功後導向 `/my/bookings/:bookingId`

## 6. Auth Pages

### 6.1 登入 `/login`

串接 API：

```text
POST /api/auth/login
GET /api/auth/me
```

Cookie：`booking_member_session`。

流程：

```text
1. 使用者輸入 email / password
2. 前端送出 POST /api/auth/login
3. 成功後後端寫入 booking_member_session（HttpOnly Cookie）
4. 前端呼叫 GET /api/auth/me 更新 currentUser
5. 若 URL 有 redirect，導回 redirect
6. 若沒有 redirect，導向 /my/bookings
```

錯誤處理：

- `INVALID_CREDENTIALS`：顯示帳號或密碼錯誤
- `USER_DISABLED`：顯示帳號已停用
- `RATE_LIMITED`：顯示登入太頻繁

### 6.2 註冊 `/register`

串接 API：

```text
POST /api/auth/register
```

流程：

```text
1. 使用者輸入 email、password、displayName
2. 前端做基本格式驗證
3. 送出 POST /api/auth/register
4. 成功後導向 /login
```

規則：

- MVP 註冊後直接啟用
- 不做 email 驗證
- 前端不可接觸 `passwordHash`

### 6.3 登出

串接 API：

```text
POST /api/auth/logout
```

流程：

```text
1. 使用者點擊登出
2. 呼叫 POST /api/auth/logout
3. 後端 revoke session 並清除 Cookie
4. 前端清空 currentUser
5. 導回首頁或 /login
```

## 7. Member Pages

### 7.1 我的預約 `/my/bookings`

用途：

- 顯示目前登入會員自己的預約
- 支援分頁與狀態篩選

串接 API：

```text
GET /api/me/bookings?page=1&pageSize=20&status=confirmed
```

頁面保護：

```text
1. 進入頁面時確認 authStatus
2. 未登入則導向 /login?redirect=/my/bookings
3. 已登入才查詢我的預約
```

狀態：

- confirmed
- cancelled
- completed：後端依 `slot.endAt` 與伺服器時間計算，MVP 不提供手動完成操作

### 7.2 預約詳情 `/my/bookings/:bookingId`

用途：

- 查看預約詳情
- 取消預約

串接 API：

```text
GET /api/me/bookings/:bookingId
POST /api/me/bookings/:bookingId/cancel
```

取消規則：

- 前端可依 `slot.startAt` 判斷是否顯示取消按鈕
- 少於 4 小時開始的預約，前端顯示不可取消原因
- 後端仍是最終判斷

取消流程：

```text
1. 使用者點擊取消
2. 前端顯示確認視窗
3. 使用者輸入或確認取消原因
4. 呼叫 POST /api/me/bookings/:bookingId/cancel
5. 成功後更新畫面狀態為 cancelled
```

若取消時收到 `BOOKING_NOT_CANCELABLE`，代表預約已取消、已完成或狀態不允許取消，前端需重新取得預約詳情並顯示目前狀態。

## 8. Admin Pages

後台與公開站分離，共通規則如下。

### 8.0 後台共通規則

**版面**

- 公開站 `SiteHeader` 在 `pathname.startsWith('/admin')` 時不渲染
- `(dashboard)/layout.tsx` 提供全螢幕後台 shell：
  - 左側 sidebar（240px）：系統名稱、路由選單、登出
  - 頂部 status bar：目前頁面標題、登入人員 `displayName` 與角色標籤
  - 主內容區：各管理頁（使用 `Page` / `PageHeader` / `Panel`）

**認證與授權**

```text
1. 後台登入頁 /admin/login：不經 dashboard layout
2. 已有 admin session 訪問 /admin/login → redirect /admin/bookings
3. dashboard layout 以 cookies() 轉送 Cookie，呼叫 GET /api/admin/auth/me（getCurrentAdminUser）
4. 無 admin session 或 role !== admin → redirect /admin/login
5. 僅 member session 的 admin 帳號無法進入 dashboard（須另做後台登入）
6. 真正寫入權限仍由後端 Admin API 驗證 admin session 與 role = admin
```

**目前 UI 實作範圍（MVP）**

- 各管理頁已串接 Admin API **唯讀列表**（`GET`）
- 建立/更新/取消等寫入操作**尚未提供表單 UI**，須直接呼叫 Admin API
- 各頁設 `export const dynamic = 'force-dynamic'`

### 8.1 後台登入 `/admin/login`

用途：

- 後台專用登入入口（與會員 `/login` 分離）
- 僅寫入 `booking_admin_session`；不與會員登入共用 cookie

串接 API：

```text
POST /api/admin/auth/login
```

流程：

```text
1. 使用者輸入 email / password
2. 前端送出 POST /api/admin/auth/login
3. 成功後後端寫入 booking_admin_session，導向 /admin/bookings 並 router.refresh()
4. 非 admin 帳號：API 回 403 FORBIDDEN，顯示「此帳號無後台管理權限。」，停留登入頁（不呼叫會員 logout）
```

錯誤處理：`INVALID_CREDENTIALS`、`USER_DISABLED`、`RATE_LIMITED` 同會員登入；非 admin 為 `FORBIDDEN`（403）。

實作：`AdminLoginForm`（Client Component）、`AdminLoginPage`（Server Component，已登入 admin 則 redirect）。

### 8.2 後台根路由 `/admin`

用途：

- 登入後進入後台的捷徑 URL
- **不顯示**舊版卡片式導覽首頁

行為：

```text
Server Component 執行 redirect('/admin/bookings')
```

預設首頁為 **預約管理**。

### 8.3 後台登出

位置：dashboard sidebar 底部 **登出** 按鈕（`AdminLogoutButton`）。

流程：

```text
1. 使用者點擊登出
2. 呼叫 POST /api/admin/auth/logout（僅清除 admin session）
3. 導向 /admin/login
4. router.refresh()
```

注意：若同時持有 member session，登出後台不影響前台登入狀態。

### 8.4 服務管理 `/admin/services`

用途：

- 查看所有服務（含 `hidden`）
- 規劃中：建立/編輯服務、設定狀態、設定主圖 URL

**目前已實作**：唯讀列表（Server Component + `getAdminServices`）。

串接 API：

```text
GET /api/admin/services?page=1&pageSize=20&status=
GET /api/admin/services/:serviceId
POST /api/admin/services
PATCH /api/admin/services/:serviceId
```

表單欄位（寫入 UI 規劃中）：

- name
- description
- imageUrl
- durationMinutes
- price
- status

狀態說明：

- `active`：前台顯示，可預約
- `inactive`：前台顯示，不可預約
- `hidden`：前台不顯示

### 8.5 時段管理 `/admin/availability`

用途：

- 查看後台時段列表
- 規劃中：單筆建立、編輯狀態、批次產生

**目前已實作**：唯讀列表（`getAdminAvailabilitySlots`）。

單筆時段 API：

```text
GET /api/admin/availability-slots?page=1&pageSize=20&serviceId=&status=&from=&to=
GET /api/admin/availability-slots/:slotId
POST /api/admin/availability-slots
PATCH /api/admin/availability-slots/:slotId
```

批次產生 API：

```text
POST /api/admin/availability-slots/bulk-generate
```

批次產生表單欄位（寫入 UI 規劃中）：

- serviceId
- timezone
- dateFrom
- dateTo
- weekdays
- timeRanges

批次產生流程：

```text
1. Admin 選擇服務
2. 系統使用 MVP 固定時區 Asia/Taipei
3. Admin 選擇日期區間
4. Admin 選擇星期，例如週一到週五
5. Admin 設定一組或多組時間區間
6. 前端送出 bulk-generate API
7. 後端依服務 durationMinutes 切成時段
8. 成功後顯示 created / skipped 統計
```

UI 注意：

- `durationMinutes` 只顯示，不由前端送出
- MVP 預設且僅支援 `Asia/Taipei`，暫不提供其他時區選項
- 遇到 `skipped` 時顯示有部分時段已存在
- 批次產生送出期間 disable submit button

### 8.6 預約管理 `/admin/bookings`

用途：

- 查看所有會員預約（**後台預設首頁**）
- 規劃中：篩選、代客建立、編輯備註、取消

**目前已實作**：唯讀列表（`getAdminBookings`）。

串接 API：

```text
GET /api/admin/bookings?page=1&pageSize=20&status=&serviceId=&userId=&from=&to=
POST /api/admin/bookings
PATCH /api/admin/bookings/:bookingId
POST /api/admin/bookings/:bookingId/cancel
```

篩選條件（寫入 UI 規劃中）：

- status
- serviceId
- userId
- from
- to

規則：

- Admin 可替任意會員建立預約
- Admin 不受會員的 1 小時後預約限制
- Admin 不受會員的 4 小時前取消限制
- 仍需避免同一時段產生多筆有效預約
- `completed` 由後端依 `slot.endAt` 與伺服器時間計算，MVP 不提供手動完成操作
- 已取消或已完成的預約再次取消時，依 API 錯誤碼顯示不可取消

### 8.7 稽核紀錄 `/admin/audit-logs`

用途：

- 查看後台重要操作
- 追蹤服務與預約異動

**目前已實作**：唯讀列表（`getAdminAuditLogs`）。

串接 API：

```text
GET /api/admin/audit-logs?page=1&pageSize=20
```

篩選條件（寫入 UI 規劃中）：

- actorUserId
- targetType
- targetId
- from
- to

## 9. 核心流程

### 9.1 預約流程

```text
1. 訪客或會員進入 /services/:serviceId
2. 前端取得服務詳情
3. 前端取得可預約時段
4. 使用者選擇時段
5. 若未登入，導向 /login?redirect=/services/:serviceId
6. 登入成功後回到服務詳情頁
7. 使用者再次選擇時段並確認預約
8. 呼叫 POST /api/bookings
9. 成功後導向 /my/bookings/:bookingId
```

錯誤處理：

- `BOOKING_SLOT_UNAVAILABLE`：顯示時段已不可預約，並刷新可預約時段
- `BOOKING_TOO_SOON`：顯示只能預約 1 小時後的時段
- `BOOKING_DUPLICATED`：顯示已預約同一時段
- `UNAUTHENTICATED`：導向登入頁

### 9.2 會員取消預約流程

```text
1. 會員進入 /my/bookings/:bookingId
2. 前端取得預約詳情
3. 前端依 startAt 判斷是否顯示取消按鈕
4. 使用者確認取消
5. 呼叫 POST /api/me/bookings/:bookingId/cancel
6. 成功後更新畫面
```

### 9.3 Admin 進入後台流程

```text
1. 使用者直接開啟 /admin/login（公開站無後台連結）
2. 輸入 admin 帳密，POST /api/admin/auth/login
3. 後端寫入 booking_admin_session 並導向 /admin/bookings
4. dashboard layout 以 GET /api/admin/auth/me 確認 admin session
5. 透過 sidebar 切換其他管理頁
```

### 9.4 Admin 批次產生時段流程

```text
1. Admin 已登入，經 sidebar 進入 /admin/availability
2. 選擇服務（目前須透過 Admin API 或外部工具操作表單）
3. 設定日期區間、星期與時間區間
4. 送出 POST /api/admin/availability-slots/bulk-generate
5. 顯示 created / skipped 統計
6. 重新整理時段列表
```

## 10. SSR / SSG / Client Fetch 建議

| 頁面 | 建議方式 | 原因 |
| --- | --- | --- |
| `/` | Server Component + revalidate | 公開資料，可快取 |
| `/services` | Server Component + revalidate | 公開資料，可快取 |
| `/services/:serviceId` | Server Component + 可預約時段動態查詢 | 詳情可快取，時段變動較頻繁 |
| `/login` | Client Component | 表單互動 |
| `/register` | Client Component | 表單互動 |
| `/my/bookings` | Dynamic / no-store | 會員私人資料 |
| `/my/bookings/:bookingId` | Dynamic / no-store | 會員私人資料 |
| `/admin/login` | Client Component（表單）+ Server redirect | 後台登入 |
| `/admin` | Server redirect | 導向 `/admin/bookings` |
| `/admin/*`（dashboard） | Dynamic / no-store + dashboard layout | 後台私人資料；layout 內 auth guard |

注意：

- 公開頁不可混入會員私人資料再做共享快取
- 會員與後台頁不應使用靜態產生
- 可預約時段需在預約成功後刷新
- 後台 Server Component 須透過 `cookies().toString()` 轉送 Cookie 呼叫 API（見 `getCurrentAdminUserFromCookieHeader`、`admin-api.ts`）

## 11. 表單與互動規則

- 表單送出期間 disable submit button
- 成功後依流程導頁或刷新資料
- 錯誤訊息依 `error.code` 對應
- 前端驗證只負責 UX，後端驗證才是安全邊界
- 日期時間輸入需清楚標示時區
- 金額使用台幣整數顯示，不使用浮點數計算

## 12. 前端風險控管

### 12.1 重複送出

措施：

- mutation pending 時 disable button
- 成功後避免重複觸發 redirect
- 遇到 409 時顯示明確狀態並刷新資料

### 12.2 時段過期

措施：

- 前端顯示時段前可過濾過去時段
- 建立預約前仍以後端判斷為準
- 預約失敗時刷新 availability

### 12.3 權限誤判

措施：

- route guard 只做 UX
- 會員頁 API 回 401 時導向 `/login`
- 後台 dashboard layout：未登入或非 admin 時 `redirect('/admin/login')`（非在頁內顯示錯誤）
- 後台登入頁：非 admin 登入成功後立即 logout 並顯示無權限訊息
- API 回 403 時顯示無權限（列表頁 catch 區塊）
- 不從前端傳入 `userId` 建立會員預約

### 12.4 SSR 資料外洩

措施：

- 會員與後台頁使用 no-store
- 不在公開頁注入 currentUser 私人資料
- 不將 session token 暴露給 Client Component

## 13. 暫不納入 MVP

- 圖片上傳 UI
- 預約改期 UI
- 線上付款流程
- Email / SMS 通知設定
- 多店家後台
- 規則式排班管理
- 後台管理頁寫入操作 UI（建立服務、批次產生時段、代客預約等；目前僅唯讀列表）
