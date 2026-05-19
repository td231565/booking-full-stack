# 預約排程系統

中小型預約排程 MVP，採 monorepo 架構：前端 **Next.js (App Router)**、後端 **NestJS**、資料庫 **PostgreSQL**。目標是練習完整的前後端串接、權限控管、預約一致性與基本資安（server-side session、HttpOnly Cookie、後端授權）。

詳細規格與契約請參考：

| 文件 | 說明 |
| --- | --- |
| [MVP_SPEC.md](./MVP_SPEC.md) | 產品範圍、業務規則、角色權限 |
| [api_contract.md](./api_contract.md) | API 路徑、請求/回應、錯誤碼 |
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
| **管理員** | 管理服務、時段、所有預約、查詢稽核紀錄（規劃中，見下方實作進度） |

### 前台（訪客 / 會員）

- **公開服務瀏覽**：`/services` 列表、`/services/:serviceId` 詳情與可預約時段
- **服務狀態**：`active` 可預約；`inactive` 仍顯示但不可預約；`hidden` 不出現在公開 API
- **預約規則**（後端強制）：
  - 建立預約前須登入
  - 僅能預約開始時間 **至少 1 小時後** 的時段
  - 同一時段僅一筆有效預約；同一會員不可重複預約同一時段
  - 僅能取消 **4 小時後才開始** 的 `confirmed` 預約
  - 結束時間已過且未取消的預約，查詢時對外顯示為 `completed`（不寫入狀態 log）
- **認證**：server-side session + HttpOnly Cookie（argon2id 密碼雜湊）

### 後台（管理員）

依 [implementation_plan.md](./implementation_plan.md) Phase 5 規劃，後台應支援：

- 服務管理（建立/更新、`active` / `inactive` / `hidden`）
- 可預約時段管理（單筆建立、更新、批次產生，時區固定 `Asia/Taipei`）
- 全站預約管理（代客建立、更新備註、取消；不受會員 1 小時/4 小時限制）
- 稽核紀錄查詢

**目前實作進度**：公開瀏覽與會員預約流程（Phase 3–4）已打通；後台 API 與管理頁面多為骨架（`/admin/*` 頁面與 `admin` module 健康檢查端點），完整後台功能尚待 Phase 5 完成。

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
│   │   │       ├── admin/            # 後台 API（進行中）
│   │   │       ├── availability/     # 時段模組（進行中）
│   │   │       └── audit-log/        # 稽核模組（進行中）
│   │   └── .env.example
│   └── web/                          # Next.js 前端
│       └── src/
│           ├── app/                  # App Router 頁面
│           │   ├── page.tsx          # 首頁
│           │   ├── services/         # 公開服務列表、詳情
│           │   ├── login/            # 登入
│           │   ├── register/         # 註冊
│           │   ├── my/bookings/      # 我的預約
│           │   └── admin/            # 後台頁面（骨架）
│           ├── components/ui/        # loading / empty / error 狀態
│           └── lib/
│               ├── api/client.ts     # API client（credentials + 錯誤碼）
│               ├── auth/             # 目前使用者
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

- **Node.js** 20+（建議 LTS）
- **npm** 10+（使用 workspaces）
- **Docker**（僅用於啟動 PostgreSQL，亦可改用本機已安裝的 Postgres）

## 如何啟用

### 1. 安裝依賴

在專案根目錄執行：

```bash
npm install
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
npm run db:migrate
```

若要還原最後一版 migration：

```bash
npm run db:migrate:revert
```

> 請在專案根目錄執行上述指令。根目錄勿使用與 `apps/api` 同名的 `migration:run`，否則 npm 會無限遞迴；若需直接操作，可改在 `apps/api` 執行 `npm run migration:run`。

### 5. 啟動開發伺服器

開兩個終端機，分別執行：

```bash
# 終端機 A：後端 API（預設 http://127.0.0.1:3001）
npm run dev:api

# 終端機 B：前端（預設 http://127.0.0.1:3000）
npm run dev:web
```

前端預設會呼叫 `http://127.0.0.1:3001` 的 API。若要自訂，可在 `apps/web` 建立 `.env.local`：

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
```

### 6. 驗證服務是否正常

| 檢查項目 | URL |
| --- | --- |
| 後端健康檢查 | http://127.0.0.1:3001/api/health |
| 前端首頁 | http://127.0.0.1:3000 |

### 其他常用指令

```bash
npm run build          # 建置 api + web
npm run typecheck      # TypeScript 檢查
```

## 前台操作方式

導覽列位於全站頂部：**服務**、**我的預約**、**後台**。

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

### 目前狀態

- 前端路由已建立：`/admin`、`/admin/services`、`/admin/availability`、`/admin/bookings`、`/admin/audit-logs`
- 各頁面目前為 **骨架畫面**，尚未串接完整 Admin API
- 後端 `GET /api/admin/module-status` 等僅供模組健康檢查

### 規劃中的後台流程（Phase 5 完成後）

以下依 [frontend_flow.md](./frontend_flow.md) 與 [api_contract.md](./api_contract.md) 說明預期操作方式：

1. **進入後台**：以 `role = admin` 帳號登入後前往 `/admin`
2. **服務管理** (`/admin/services`)：建立/編輯服務、設定 `active` / `inactive` / `hidden`
3. **時段管理** (`/admin/availability`)：為 `active` 服務建立或批次產生可預約時段
4. **預約管理** (`/admin/bookings`)：查詢全站預約、代客建立/更新備註/取消
5. **稽核紀錄** (`/admin/audit-logs`)：查詢後台重要操作紀錄

### 建立管理員帳號（開發用）

註冊 API 只會建立 `role = user` 的會員。開發階段若需測試後台，請在資料庫手動將使用者升級為管理員，例如：

```sql
UPDATE users SET role = 'admin' WHERE email = '你的-email@example.com';
```

完成 Phase 5 後，建議改以 migration seed 或專用管理腳本建立初始 admin，避免手動改 DB。

## 主要 API 一覽（已實作）

前綴皆為 `/api`。成功回應格式為 `{ data: ... }`，列表為 `{ data: [...], meta: { page, pageSize, total, totalPages } }`，錯誤為 `{ error: { code, message } }`。

| 方法 | 路徑 | 說明 | 需登入 |
| --- | --- | --- | --- |
| GET | `/health` | 健康檢查 | 否 |
| GET | `/services` | 公開服務列表 | 否 |
| GET | `/services/:serviceId` | 服務詳情 | 否 |
| GET | `/services/:serviceId/availability` | 可預約時段 | 否 |
| POST | `/auth/register` | 註冊 | 否 |
| POST | `/auth/login` | 登入（寫入 session cookie） | 否 |
| POST | `/auth/logout` | 登出 | 是 |
| GET | `/auth/me` | 目前使用者 | 是 |
| POST | `/bookings` | 建立預約 | 是 |
| GET | `/me/bookings` | 我的預約列表 | 是 |
| GET | `/me/bookings/:bookingId` | 我的預約詳情 | 是 |
| POST | `/me/bookings/:bookingId/cancel` | 取消我的預約 | 是 |

完整 Admin API 定義見 [api_contract.md](./api_contract.md)。

## 架構與安全重點

- **時間**：DB 存 UTC；API 回傳 ISO 8601；前端依使用者時區顯示
- **授權**：後端不信任前端傳入的 `userId` / `role`；會員只能存取自己的預約
- **Session**：Cookie 設定 `HttpOnly`、`Secure`、`SameSite=Lax`；DB 僅存 token hash
- **快取**：會員頁與後台頁使用 `dynamic = 'force-dynamic'`，避免 SSR 共享私人資料
- **Rate limit**：全站已掛載 Throttler（細部規則見 api_contract）

## 疑難排解

| 問題 | 可能原因與處理 |
| --- | --- |
| migration 失敗 | 確認 Postgres 已啟動、`DATABASE_URL` 正確 |
| 前端無法呼叫 API | 確認 `dev:api` 已啟動；檢查 `NEXT_PUBLIC_API_BASE_URL` |
| 登入後仍像未登入 | Cookie 設為 `Secure`，請使用 `127.0.0.1` 且確認瀏覽器允許本機 Secure cookie；必要時檢查 CORS 的 `WEB_ORIGIN` 是否與前端網址一致 |
| 看不到可預約時段 | 種子時段約在「現在 + 2 天」；須為 `active` 服務且距開始 ≥ 1 小時、狀態為 `available`、且無人預約 |

## 授權

本專案為練習用 MVP，未另行標註授權條款。
