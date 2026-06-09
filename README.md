# 預約排程系統

中小型預約排程 MVP，採 monorepo 架構：前端 **Next.js (App Router)**、後端 **NestJS**、資料庫 **PostgreSQL**。目標是練習完整的前後端串接、權限控管、預約一致性與基本資安（server-side session、HttpOnly Cookie、後端授權）。

詳細規格與契約請參考：

| 文件 | 說明 |
| --- | --- |
| [MVP_SPEC.md](./MVP_SPEC.md) | 產品範圍、業務規則、角色權限 |
| [api_contract.md](./docs/api_contract.md) | API 路徑、請求/回應、錯誤碼 |
| [db_schema.md](./db_schema.md) | 資料表、索引、交易規則 |
| [frontend_flow.md](./frontend_flow.md) | 前端路由與串接流程 |
| [implementation_plan.md](./implementation_plan.md) | 分階段實作計畫 |
| [verification_checklist.md](./verification_checklist.md) | 各階段驗證清單 |

## 功能介紹

### 使用者角色

| 角色 | 能力 |
| --- | --- |
| **訪客** | 瀏覽公開服務列表與詳情、查看可預約時段（不需登入） |
| **一般會員** | 註冊、登入、建立預約、查看/取消自己的預約 |
| **管理員** | 透過獨立後台登入管理服務、時段、全站預約與稽核紀錄（API 已完成；前端管理頁為唯讀列表，寫入操作須透過 Admin API） |

### 前台（訪客 / 會員）

- **公開服務瀏覽**：`/services` 列表、`/services/:serviceId` 詳情與可預約時段
- **服務狀態**：`active` 可預約；`inactive` 仍顯示但不可預約；`hidden` 不出現在公開 API
- **預約規則**（後端強制）：
  - 建立預約前須登入
  - 僅能預約開始時間 **至少 1 小時後** 的時段
  - 同一時段僅一筆有效預約；同一會員不可重複預約同一時段
  - 僅能取消 **4 小時後才開始** 的 `confirmed` 預約
  - 結束時間已過且未取消的預約，查詢時對外顯示為 `completed`（不寫入狀態 log）
- **認證**：server-side session + HttpOnly Cookie（argon2id 密碼雜湊）；前台 `booking_member_session`、後台 `booking_admin_session` 分離，可同時登入

### 後台（管理員）

依 [implementation_plan.md](./implementation_plan.md) Phase 5 規劃，後台應支援：

- 服務管理（建立/更新、`active` / `inactive` / `hidden`）
- 可預約時段管理（單筆建立、更新、批次產生，時區固定 `Asia/Taipei`）
- 全站預約管理（代客建立、更新備註、取消；不受會員 1 小時/4 小時限制）
- 稽核紀錄查詢

**目前實作進度**：公開瀏覽與會員預約流程（Phase 3–4）已打通；後台 Admin API（Phase 5）已完成。前端後台為獨立路由體系（`/admin/login` 登入、sidebar 導覽、status bar），各管理頁已串接 API 顯示唯讀列表；建立/更新/取消等寫入操作尚未提供 UI，須直接呼叫 Admin API。

### 開發用種子資料

執行 migration 後，資料庫會自動建立範例服務（見 `1700000001000-CreatePublicServiceCatalog`）：

| 服務名稱 | 狀態 | 說明 |
| --- | --- | --- |
| 個人諮詢 | `active` | 含可預約時段（約 2 天後 09:00、11:00） |
| 團隊諮詢 | `inactive` | 前台可見，不可預約 |
| 內部測試服務 | `hidden` | 僅後台可見，公開 API 不回傳 |

## 檔案結構

```text
.
├── apps/
│   ├── api/                          # NestJS 後端
│   │   ├── src/
│   │   │   ├── main.ts               # 啟動、CORS、全域 prefix `api`
│   │   │   ├── app.module.ts         # 模組與 TypeORM、Throttler 設定
│   │   │   ├── common/               # API 回應格式、例外、Guards
│   │   │   ├── database/
│   │   │   │   ├── data-source.ts    # TypeORM migration 設定
│   │   │   │   └── migrations/       # 資料庫 schema 與種子資料
│   │   │   └── modules/
│   │   │       ├── auth/             # 註冊、登入、登出、me
│   │   │       ├── service-catalog/  # 公開服務 API
│   │   │       ├── booking/          # 會員預約 API
│   │   │       ├── admin/            # 後台 API
│   │   │       ├── availability/     # 時段模組
│   │   │       └── audit-log/        # 稽核模組
│   │   └── .env.example
│   └── web-next/                     # Next.js 前端
│       └── src/
│           ├── app/                  # App Router 頁面
│           │   ├── (site)/           # 前台路由群組
│           │   │   ├── layout.tsx    # 前台共用 Layout（含 SiteHeader）
│           │   │   ├── page.tsx      # 首頁
│           │   │   ├── services/     # 公開服務列表、詳情
│           │   │   ├── login/        # 登入
│           │   │   ├── register/     # 註冊
│           │   │   └── my/bookings/  # 我的預約
│           │   └── (manage)/         # 後台路由群組
│           │       └── admin/        # 後台（獨立路由）
│           │           ├── (auth)/login/ # 後台登入頁
│           │           └── (dashboard)/  # sidebar + status bar + 管理頁
│           │               ├── bookings/   # 預約管理（預設首頁）
│           │               ├── services/
│           │               ├── availability/
│           │               └── audit-logs/
│           ├── components/
│           │   ├── ui/               # loading / empty / error 狀態
│           │   ├── admin/            # 後台 sidebar、status bar、登出
│           │   └── site-header.tsx   # 公開站 header（/admin 不顯示）
│           └── lib/
│               ├── api/client.ts     # API client（credentials + 錯誤碼）
│               ├── auth/             # 目前使用者
│               ├── admin/            # 後台 API 封裝
│               ├── services/         # 公開服務資料取得
│               └── bookings/         # 會員預約 API 封裝
├── docker-compose.yml                # PostgreSQL 16
├── package.json                      # monorepo scripts
├── MVP_SPEC.md
├── api_contract.md
├── db_schema.md
├── frontend_flow.md
├── implementation_plan.md
└── verification_checklist.md
```

## 環境需求

- **Bun** 1.0+（建議，本專案已全面改用 Bun 管理）
- **Docker**（僅用於啟動 PostgreSQL，亦可改用本機已安裝的 Postgres）

## 如何啟用

### 1. 安裝依賴

在專案根目錄執行：

```bash
bun install
```

### 2. 啟動資料庫

```bash
docker compose up -d
```

預設連線資訊（與 `docker-compose.yml` 一致）：

- Host: `localhost:5432`
- Database: `booking_scheduler`
- User / Password: `booking_scheduler`

### 3. 設定後端環境變數

```bash
cp apps/api/.env.example apps/api/.env
```

`apps/api/.env` 範例：

```env
DATABASE_URL=postgres://booking_scheduler:booking_scheduler@localhost:5432/booking_scheduler
PORT=3001
# 選填：允許的前端來源（CORS）
WEB_ORIGIN=http://127.0.0.1:3000
```

### 4. 執行資料庫 migration

```bash
bun db:migrate
```

若要還原最後一版 migration：

```bash
bun db:migrate:revert
```

> 請在專案根目錄執行上述指令。若需指定後端工作區操作，可改執行 `bun --filter @booking-scheduler/api migration:run`。

### 5. 啟動開發伺服器

開兩個終端機，分別執行：

```bash
# 終端機 A：後端 API（預設 http://127.0.0.1:3001）
bun dev:api

# 終端機 B：前端（預設 http://127.0.0.1:3000）
bun dev:web
```

前端預設會呼叫 `http://127.0.0.1:3001` 的 API。若要自訂，可在 `apps/web-next` 建立 `.env.local`：

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
```

### 6. 驗證服務是否正常

| 檢查項目 | URL |
| --- | --- |
| 後端健康檢查 | http://127.0.0.1:3001/api/health |
| 前端首頁 | http://127.0.0.1:3000 |
| 後台登入頁 | http://127.0.0.1:3000/admin/login |

### 7. 關閉所有服務

依啟動順序的**反向**關閉即可。

#### 1. 停止開發伺服器

在執行 `bun dev:api`、`bun dev:web` 的終端機各按 **`Ctrl + C`**，直到程序結束並回到 shell 提示符。

若終端機已關閉但 port 仍被佔用，可在專案根目錄查詢並結束（擇一使用）：

```bash
# 查看 3000、3001 是否仍被佔用
lsof -i :3000 -i :3001

# 依 PID 結束（將 <PID> 換成上一步查到的數字）
kill <PID>
```

#### 2. 停止 PostgreSQL（Docker）

在專案根目錄執行：

```bash
docker compose down
```

容器停止後，本機 **5432** 會釋放；資料仍保留在 Docker volume `postgres_data` 中，下次 `docker compose up -d` 會沿用原資料。

若要**一併刪除資料庫資料**（下次需重新 `db:migrate`）：

```bash
docker compose down -v
```

#### 3. 確認已全部關閉（選用）

```bash
docker compose ps          # 應無 booking 相關容器在運行
lsof -i :3000 -i :3001     # 應無 LISTEN（除非其他程式佔用該 port）
lsof -i :5432              # 若只用本專案 Docker Postgres，應無 LISTEN
```

### 其他常用指令

```bash
bun run build          # 建置 api + web
bun run typecheck      # TypeScript 檢查
```

## 開發規範

- **TDD 開發流程**：務必遵守 TDD 開發流程。開發前確實寫出符合需求的測試案例，並在開發前後實際執行測試，得到符合預期的紅/綠結果。

## 前台操作方式

導覽列位於全站頂部：**服務**、**我的預約**（後台無公開入口，須直接前往 `/admin/login`）。

### 訪客：瀏覽服務

1. 開啟 http://127.0.0.1:3000 ，點 **查看服務** 或導覽 **服務**
2. 在 `/services` 查看 `active` / `inactive` 服務（`inactive` 會標示不可預約）
3. 點選服務進入 `/services/:serviceId`
4. 在 **可預約時段** 區塊查看時段（僅 `active` 服務且符合 1 小時後規則的 `available` 時段）

### 會員：註冊、登入、預約

1. **註冊**：`/register` 填寫 email、密碼、顯示名稱 → 成功後導向登入頁
2. **登入**：`/login` → 成功後依 `redirect` 參數返回原頁，或前往預設頁
3. **建立預約**：
   - 在服務詳情頁選擇時段，填寫備註（選填）後按 **預約**
   - 未登入時會導向 `/login?redirect=/services/:serviceId`
   - 成功後導向 `/my/bookings/:bookingId`
4. **我的預約**：
   - `/my/bookings` 查看列表（未登入會導向登入）
   - 點選單筆進入詳情，可填寫原因後 **取消預約**（須符合 4 小時前規則）

### 預約相關錯誤（前端會依 `error.code` 顯示）

| 錯誤碼 | 情境 |
| --- | --- |
| `UNAUTHENTICATED` | 未登入即操作需登入功能 |
| `BOOKING_SLOT_UNAVAILABLE` | 時段已被預約或不可用 |
| `BOOKING_TOO_SOON` | 時段開始時間少於 1 小時 |
| `BOOKING_CANCEL_TOO_LATE` | 取消時距開始少於 4 小時 |
| `BOOKING_DUPLICATED` | 重複預約同一時段 |
| `BOOKING_NOT_CANCELABLE` | 預約已取消或不可再取消 |

## 後台操作方式

後台與前台分離：公開站導覽列不含後台連結，`/admin/*` 使用獨立版面（左側 sidebar 選單、頂部 status bar 顯示登入人員）。

### 路由一覽

| 路徑 | 說明 |
| --- | --- |
| `/admin/login` | 後台專用登入頁（驗證 `role = admin`） |
| `/admin` | 登入後自動導向 `/admin/bookings` |
| `/admin/bookings` | 預約管理（預設首頁，唯讀列表） |
| `/admin/services` | 服務管理（唯讀列表，含 `hidden`） |
| `/admin/availability` | 時段管理（唯讀列表） |
| `/admin/audit-logs` | 稽核紀錄（唯讀列表） |

### 操作步驟

1. **建立管理員帳號**（開發用）：註冊 API 只會建立 `role = user` 的會員，須在資料庫手動升級，例如：

   ```sql
   UPDATE users SET role = 'admin' WHERE email = '你的-email@example.com';
   ```

2. **登入後台**：開啟 http://127.0.0.1:3000/admin/login ，以 admin 帳號登入（`POST /api/admin/auth/login`，寫入 `booking_admin_session`）
   - 非 admin 帳號會顯示「此帳號無後台管理權限」（403）
   - 僅在 `/login` 會員登入不足以進入後台；須完成後台登入
   - 登入成功後導向 **預約管理**（`/admin/bookings`）
3. **瀏覽管理資料**：左側 sidebar 切換各管理頁，頂部 status bar 顯示目前頁面與登入人員
4. **寫入操作**：建立服務、批次產生時段、代客建立/取消預約等，目前須直接呼叫 Admin API（完整定義見 [api_contract.md](./api_contract.md)）
5. **登出**：sidebar 底部 **登出** 按鈕（`POST /api/admin/auth/logout`），僅清除後台 session 後返回 `/admin/login`

### 權限與存取控制

- 未登入或非 admin 訪問 `/admin/*`（登入頁除外）會 redirect 至 `/admin/login`
- 前端 route guard 僅改善 UX；真正權限由後端 Admin API 的 `role = admin` 檢查
- 後台頁使用 `dynamic = 'force-dynamic'`，避免 SSR 共享快取

## 主要 API 一覽（已實作）

前綴皆為 `/api`。成功回應格式為 `{ data: ... }`，列表為 `{ data: [...], meta: { page, pageSize, total, totalPages } }`，錯誤為 `{ error: { code, message } }`。

| 方法 | 路徑 | 說明 | 需登入 |
| --- | --- | --- | --- |
| GET | `/health` | 健康檢查 | 否 |
| GET | `/services` | 公開服務列表 | 否 |
| GET | `/services/:serviceId` | 服務詳情 | 否 |
| GET | `/services/:serviceId/availability` | 可預約時段 | 否 |
| POST | `/auth/register` | 註冊 | 否 |
| POST | `/auth/login` | 會員登入（`booking_member_session`） | 否 |
| POST | `/auth/logout` | 會員登出 | member |
| GET | `/auth/me` | 目前會員使用者 | member |
| POST | `/admin/auth/login` | 後台登入（`booking_admin_session`） | 否 |
| POST | `/admin/auth/logout` | 後台登出 | admin |
| GET | `/admin/auth/me` | 目前後台登入者 | admin |
| POST | `/bookings` | 建立預約 | 是 |
| GET | `/me/bookings` | 我的預約列表 | 是 |
| GET | `/me/bookings/:bookingId` | 我的預約詳情 | 是 |
| POST | `/me/bookings/:bookingId/cancel` | 取消我的預約 | 是 |

完整 Admin API 定義見 [api_contract.md](./api_contract.md)。

## 架構與安全重點

- **時間**：DB 存 UTC；API 回傳 ISO 8601；前端依使用者時區顯示
- **授權**：後端不信任前端傳入的 `userId` / `role`；會員只能存取自己的預約；Admin API 僅 `role = admin` 可存取
- **後台版面**：`/admin/*` 與公開站分離，不使用公開站 header，以 sidebar + status bar 呈現
- **Session**：兩顆 Cookie（`booking_member_session` / `booking_admin_session`），皆設定 `HttpOnly`、`Secure`、`SameSite=Lax`；DB 僅存 token hash；登出僅撤銷對應 audience 的 session
- **快取**：會員頁與後台頁使用 `dynamic = 'force-dynamic'`，避免 SSR 共享私人資料
- **Rate limit**：依 `api_contract.md` §2.8 分路由限流（`bun verify:phase6` 可驗證）

## 疑難排解

| 問題 | 可能原因與處理 |
| --- | --- |
| migration 失敗 | 確認 Postgres 已啟動、`DATABASE_URL` 正確 |
| 前端無法呼叫 API | 確認 `dev:api` 已啟動；檢查 `NEXT_PUBLIC_API_BASE_URL` |
| 登入後仍像未登入 | Cookie 設為 `Secure`，請使用 `127.0.0.1` 且確認瀏覽器允許本機 Secure cookie；必要時檢查 CORS 的 `WEB_ORIGIN` 是否與前端網址一致 |
| 後台登入顯示無權限 | 確認 DB 中該使用者 `role = 'admin'`；一般會員帳號無法進入後台 |
| 看不到可預約時段 | 種子時段約在「現在 + 2 天」；須為 `active` 服務且距開始 ≥ 1 小時、狀態為 `available`、且無人預約 |

## 授權

本專案為練習用 MVP，未另行標註授權條款。
