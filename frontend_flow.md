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

資料安全原則：

- 前端不讀取 HttpOnly Cookie
- 前端不保存 access token 到 localStorage
- 前端登入狀態以 `GET /api/auth/me` 為準
- 前端 route guard 只改善 UX，真正權限由後端 API 驗證

## 3. 建議路由結構

```text
app/
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
  admin/
    page.tsx
    services/
      page.tsx
    availability/
      page.tsx
    bookings/
      page.tsx
    audit-logs/
      page.tsx
```

建議共用模組：

```text
src/
  features/
    auth/
    services/
    bookings/
    admin/
  lib/
    api/
    date/
    errors/
  components/
    ui/
```

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
2. 呼叫 GET /api/auth/me
3. 成功時設定 currentUser
4. 401 時視為未登入
```

注意：

- Cookie 是 HttpOnly，前端不直接讀 token
- 不要把 user role 當成安全邊界
- Admin API 仍必須由後端檢查 `role = admin`

### 4.2 API 錯誤狀態

前端應依 API `error.code` 顯示穩定訊息。

常見對應：

| error.code | 前端處理 |
| --- | --- |
| UNAUTHENTICATED | 導向登入頁 |
| FORBIDDEN | 顯示無權限 |
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

流程：

```text
1. 使用者輸入 email / password
2. 前端送出 POST /api/auth/login
3. 成功後後端寫入 HttpOnly Cookie
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
- completed

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

## 8. Admin Pages

後台共通規則：

- 進入後台前呼叫 `GET /api/auth/me`
- 未登入導向 `/login`
- 已登入但不是 admin，顯示無權限
- 真正權限仍由後端 Admin API 驗證

### 8.1 後台首頁 `/admin`

用途：

- 顯示後台入口
- 顯示今日預約摘要
- 導向服務、時段、預約、稽核紀錄

MVP 可先只做導覽，不一定需要統計 API。

### 8.2 服務管理 `/admin/services`

用途：

- 建立服務
- 編輯服務
- 設定服務狀態
- 設定主圖 URL

串接 API：

```text
POST /api/admin/services
PATCH /api/admin/services/:serviceId
```

表單欄位：

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

### 8.3 時段管理 `/admin/availability`

用途：

- 單筆建立可預約時段
- 編輯時段狀態
- 批次產生可預約時段

單筆時段 API：

```text
POST /api/admin/availability-slots
PATCH /api/admin/availability-slots/:slotId
```

批次產生 API：

```text
POST /api/admin/availability-slots/bulk-generate
```

批次產生表單欄位：

- serviceId
- timezone
- dateFrom
- dateTo
- weekdays
- timeRanges

批次產生流程：

```text
1. Admin 選擇服務
2. Admin 選擇時區，MVP 預設 Asia/Taipei
3. Admin 選擇日期區間
4. Admin 選擇星期，例如週一到週五
5. Admin 設定一組或多組時間區間
6. 前端送出 bulk-generate API
7. 後端依服務 durationMinutes 切成時段
8. 成功後顯示 created / skipped 統計
```

UI 注意：

- `durationMinutes` 只顯示，不由前端送出
- 遇到 `skipped` 時顯示有部分時段已存在
- 批次產生送出期間 disable submit button

### 8.4 預約管理 `/admin/bookings`

用途：

- 查看所有預約
- 依條件篩選
- 替會員建立預約
- 編輯備註
- 取消預約
- 標記完成

串接 API：

```text
GET /api/admin/bookings?page=1&pageSize=20&status=&serviceId=&userId=&from=&to=
POST /api/admin/bookings
PATCH /api/admin/bookings/:bookingId
PATCH /api/admin/bookings/:bookingId/status
POST /api/admin/bookings/:bookingId/cancel
```

篩選條件：

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

### 8.5 稽核紀錄 `/admin/audit-logs`

用途：

- 查看後台重要操作
- 追蹤服務與預約異動

串接 API：

```text
GET /api/admin/audit-logs?page=1&pageSize=20
```

篩選條件：

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

### 9.3 Admin 批次產生時段流程

```text
1. Admin 進入 /admin/availability
2. 選擇服務
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
| `/admin/*` | Dynamic / no-store | 後台私人資料 |

注意：

- 公開頁不可混入會員私人資料再做共享快取
- 會員與後台頁不應使用靜態產生
- 可預約時段需在預約成功後刷新

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
- API 回 401 時導向登入
- API 回 403 時顯示無權限
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
