# 預約排程系統 MVP 規格書

## 1. 產品目標

建立一個中小型但具備真實後端架構練習價值的預約排程系統。系統需包含公開服務瀏覽、會員預約、後台管理、權限控管、資料一致性、前後端串接風險與基本資安措施。

此 MVP 的目的不是做完整 SaaS，而是快速看清楚以下能力：

- 後端語言與分層架構設計
- PostgreSQL 資料表設計與交易處理
- API 權限與錯誤處理
- 前端 SSR / CSR 串接邊界
- 使用者流程中的風險與資安措施

## 2. 核心情境

使用者可以不登入瀏覽服務項目與可預約資訊；當使用者要建立預約、查看自己的預約或取消預約時，才需要登入。

已停用服務仍可被查看，但前台必須清楚顯示停用狀態，且不可再建立新的預約。

隱藏服務不顯示於前台列表，也不提供一般訪客瀏覽。

管理員可以登入後台，管理服務項目、設定可預約時段、查看所有預約，並新增、編輯、取消預約。

## 3. 業務規則

### 3.1 服務規則

- 服務可公開顯示，訪客不需要登入即可查看服務列表與服務詳情
- 服務時長由後台設定，每個服務可以有不同時長
- 已停用服務仍顯示於前台列表，但前台需清楚標示目前不可預約
- 已停用服務不可建立新的可預約時段或新的預約
- 隱藏服務不顯示於前台列表，也不提供一般訪客瀏覽

### 3.2 預約規則

- 建立預約前必須登入
- 預約建立後預設狀態為 confirmed
- 預約未取消且結束時間已過時，對外視為 completed，MVP 不提供手動完成操作
- 同一使用者不可重複預約同一個時段
- 一個時段只開放一人預約
- 使用者只能取消自己 4 小時後才開始的預約
- 過去時段不可預約
- 只能預約開始時間至少在 1 小時後的時段
- 管理員可以新增、編輯、取消預約，且不受會員的「1 小時後可預約」與「4 小時前可取消」限制

### 3.3 權限規則

- 訪客可以查看服務與可預約時段
- 會員可以建立預約、查看自己的預約、取消自己的預約
- 管理員可以管理服務、時段與所有預約
- 後端不可信任前端傳入的 user_id 或 role

### 3.4 時間規則

- DB 統一儲存 UTC
- API 回傳 ISO 8601 格式時間
- 前端依使用者所在時區顯示時間
- 後台建立時段時，建議明確指定系統營運時區，MVP 先固定使用 Asia/Taipei
- 批次產生時段在 MVP 僅支援 Asia/Taipei，因此暫不處理 DST 造成的日期邊界與重複本地時間
- 後端所有「1 小時後可預約」與「4 小時前可取消」判斷都以伺服器時間為準

### 3.5 認證與 Session 規則

- 建議使用 server-side session 搭配 HttpOnly Cookie
- Cookie 必須設定 HttpOnly、Secure、SameSite=Lax
- Access token 不建議存 localStorage
- MVP 階段不建議先做 refresh token 流程，避免認證複雜度過早升高
- 密碼雜湊建議使用 argon2id
- 會員註冊後直接啟用，MVP 階段不做 email 驗證

### 3.6 Rate Limit 規則

- 登入、註冊、建立預約、取消預約必須加 rate limit
- Public API 可加較寬鬆的 rate limit，避免服務列表或時段查詢被大量打爆
- Admin API 仍需 rate limit，但主要風險控制應放在認證、授權與 audit log
- Rate limit 可先用記憶體方案完成 MVP，部署到多 instance 時再改用 Redis

## 4. 使用者角色

### 4.1 訪客

- 可以查看公開服務列表
- 可以查看公開服務詳情
- 可以查看可預約日期與時段
- 不可以建立預約
- 不可以查看任何會員資料或預約資料

### 4.2 一般會員

- 可以建立預約
- 可以查看自己的預約列表
- 可以取消自己的預約
- 不可以查看其他使用者的預約
- 不可以進入後台管理頁

### 4.3 管理員

- 可以管理服務項目
- 可以設定服務可預約時段
- 可以查看所有預約
- 可以新增、編輯、取消預約
- 可以查看操作紀錄

## 5. MVP 功能範圍

### 5.1 前台公開功能

- 服務列表頁
- 服務詳情頁
- 可預約時段查詢

公開頁面不需要登入，適合使用 SSR 或 SSG 提升首次載入速度與 SEO。

### 5.2 會員功能

- 註冊
- 登入
- 登出
- 建立預約
- 我的預約列表
- 取消我的預約

建立預約前必須完成登入。前端可以在使用者點擊預約時導向登入頁，登入後再回到原本的服務或時段頁。

### 5.3 後台功能

- 管理服務項目
- 啟用 / 停用服務項目
- 設定可預約時段
- 查看預約列表
- 新增、編輯、取消預約
- 查看操作紀錄

後台頁面必須檢查管理員權限，不能只依賴前端路由保護。

## 6. 建議技術選型

### 6.1 前端

建議使用 Next.js 或 Nuxt。

如果你想用 React：

- Next.js
- TypeScript
- TanStack Query 或 SWR
- Zod
- Tailwind CSS

如果你想用 Vue：

- Nuxt
- TypeScript
- Pinia
- Zod 或 Valibot
- Tailwind CSS

### 6.2 後端

建議優先選 NestJS。

原因：

- 對前端工程師上手成本低
- Module、Controller、Service、Guard 結構清楚
- 適合練習中小型後端架構
- TypeScript 可與前端共用部分型別思維

替代方案：

- Go + Gin / Fiber：適合練習更明確的 service / repository 分層
- Python + FastAPI：適合快速開發與自動產生 OpenAPI 文件

### 6.3 Database

建議使用 PostgreSQL。

原因：

- 適合處理關聯資料
- 支援交易與唯一約束
- 適合處理預約衝突
- 可練習索引、constraint、migration

Redis 可列為第二階段加入，用於 rate limit、短期鎖或快取公開服務資料。

## 7. 後端架構設計

建議採用分層架構：

- Controller：處理 HTTP request / response
- DTO / Schema：處理輸入驗證
- Service：處理商業邏輯
- Repository：封裝資料存取
- Guard / Middleware：處理認證、授權、rate limit
- Domain Module：依業務領域拆分模組

建議模組：

- AuthModule
- UserModule
- ServiceCatalogModule
- AvailabilityModule
- BookingModule
- AdminModule
- AuditLogModule

建立預約時，核心邏輯應放在 BookingService，不應由 Controller 直接操作 DB。

## 8. DB Schema 設計

DB 詳細設計請參考 `db_schema.md`。

本 MVP 的主要資料表包含：

- `users`
- `services`
- `availability_slots`
- `bookings`
- `booking_status_logs`
- `sessions`
- `audit_logs`

核心資料規則：

- `services` 使用 `active`、`inactive`、`hidden` 區分前台顯示與可預約狀態
- `services.image_url` 儲存服務主圖 URL，MVP 不建立多圖資料表
- `availability_slots` 代表實際可被預約的時間格子，不使用規則式排班
- `bookings` 不保留 `pending`，建立成功後預設為 `confirmed`
- 一個 `availability_slot` 只能有一筆非 `cancelled` 的有效預約
- 同一會員不可重複預約同一個 `availability_slot`
- 會員與管理員建立、取消預約都需寫入 `booking_status_logs`
- 登入狀態使用 `sessions` 搭配 HttpOnly Cookie
- 後台重要操作需寫入 `audit_logs`

## 9. API 設計

API 詳細契約請參考 `api_contract.md`。

本 MVP 採用 REST API，主要分為：

- Public API：公開服務列表、服務詳情、可預約時段，不需要登入
- Auth API：註冊、登入、登出、取得目前登入者
- Member API：會員建立預約、查看自己的預約、取消自己的預約
- Admin API：後台管理服務、時段、預約與稽核紀錄

核心 API 規則：

- 成功與錯誤回應格式需統一
- 錯誤回應需提供穩定的 `code`
- 分頁統一使用 `page` 與 `pageSize`
- Public API 不回傳 `hidden` 服務
- Member API 不接受前端傳入的 `userId`
- Admin API 必須由後端檢查 `role = admin`
- 重要後台操作需寫入 `audit_logs`

## 10. 前端頁面規劃

### 10.1 公開頁面

- /：首頁
- /services：服務列表
- /services/:id：服務詳情與可預約時段

公開頁面可以 SSR / SSG。服務價格、描述、時長、狀態與可預約時段需從 Public API 取得。若服務已停用，前端需清楚顯示不可預約。

### 10.2 會員頁面

- /login：登入
- /register：註冊
- /my/bookings：我的預約
- /my/bookings/:id：預約詳情

使用者點擊預約但尚未登入時，導向登入頁。登入成功後可回到原服務詳情頁。

### 10.3 後台頁面

- /admin：後台首頁
- /admin/services：服務管理
- /admin/availability：時段管理
- /admin/bookings：預約管理
- /admin/audit-logs：操作紀錄

後台頁面需有前端 route guard，但真正權限仍以後端 API 為準。

## 11. 前後端串接風險

### 11.1 重複送出

風險：

- 使用者連點預約按鈕造成重複預約
- 網路重試造成同一請求被送出多次

措施：

- 前端送出時鎖定按鈕
- 後端使用交易檢查可預約名額
- 可加入 idempotency key 避免重複建立

### 11.2 預約名額競爭

風險：

- 多位使用者同時預約同一時段
- 前端看到的剩餘名額已過期

措施：

- 後端以 DB 交易處理建立預約
- 查詢與寫入不可分離成不受控流程
- 必要時鎖定 availability_slots 該筆資料
- bookings 需限制同一時段只能有一筆有效預約

### 11.3 時區問題

風險：

- 前端顯示時間與 DB 儲存時間不一致
- 使用者看到的日期跨日

措施：

- DB 儲存 UTC
- API 回傳 ISO 8601
- 前端依使用者時區顯示
- 後台建立時段時明確標示系統營運時區
- 可預約與可取消判斷以伺服器時間為準

### 11.4 權限錯置

風險：

- 使用者改 API path 查看他人預約
- 前端隱藏按鈕但 API 未檢查權限

措施：

- 後端所有 member API 使用目前登入者身份查詢
- Admin API 使用 role-based guard
- 不信任前端傳入的 user_id

### 11.5 SSR 資料外洩

風險：

- SSR 頁面錯誤快取私人資料
- 使用者 A 的資料被使用者 B 看到

措施：

- 公開頁面才做公共快取
- 會員資料頁禁用共享快取
- SSR 時依 Cookie 取得使用者身份，不將敏感資料注入公開頁

## 12. 資安措施

### 12.1 認證

- 密碼使用 argon2id 雜湊
- 登入狀態建議使用 server-side session 搭配 HttpOnly Cookie
- Cookie 設定 HttpOnly、Secure、SameSite=Lax
- 登出時清除 session
- 不將 access token 儲存在 localStorage
- 會員註冊後直接啟用，MVP 階段不做 email 驗證

argon2id 是目前較推薦的密碼雜湊選擇，原因是它同時考慮 CPU 與記憶體成本，比單純快速 hash 更適合抵抗暴力破解。MVP 可先使用合理預設參數，後續再依部署環境調整成本。

### 12.2 授權

- 後端集中處理 auth guard
- Admin API 必須檢查 role
- Member API 必須檢查資料擁有者

### 12.3 輸入驗證

- 前端驗證只提升 UX
- 後端驗證才是安全邊界
- email、password、日期、金額、狀態 enum 都需後端驗證

### 12.4 常見攻擊防護

- 防止 XSS：避免直接渲染未清洗 HTML
- 防止 CSRF：使用 SameSite=Lax Cookie，若後續支援跨站嵌入或第三方來源，再加入 CSRF token
- 防止暴力登入：登入 API 加 rate limit
- 防止資訊洩漏：錯誤訊息不要透露帳號是否存在
- 防止越權：所有敏感 API 都需檢查登入者身份與角色

### 12.5 Rate Limit

- 登入與註冊：必須限制，避免暴力破解與大量註冊
- 建立與取消預約：必須限制，避免惡意操作與重複請求
- Public API：建議限制，但門檻可較寬，避免影響正常瀏覽
- Admin API：建議限制，並搭配 audit log 追蹤操作

後端技術不熟時，MVP 可先用框架或套件提供的 rate limit middleware。若部署成多台 server，再改用 Redis 做集中計數。

### 12.6 Log 與稽核

- 後台重要操作需寫入 audit_logs
- 不在 log 中記錄密碼、token、完整 Cookie
- 錯誤 log 需保留 request id，方便追蹤問題

MVP 階段建議寫入 audit log 的操作：

- 建立、更新服務
- 建立、更新、批次產生可預約時段
- Admin 建立、更新、取消預約
- 查詢操作暫不寫入 audit log

## 13. MVP 開發順序

### Phase 1：基礎架構

- 建立前後端專案
- 建立 PostgreSQL
- 建立 migration
- 建立 users、services、availability_slots、bookings
- 建立基本 API response 格式

### Phase 2：公開服務瀏覽

- 服務列表 API
- 服務詳情 API
- 可預約時段 API
- 前台服務列表頁
- 前台服務詳情頁

### Phase 3：會員與預約

- 註冊
- 登入
- 建立預約
- 我的預約
- 取消預約
- 預約衝突處理

### Phase 4：後台管理

- Admin 權限
- 服務管理
- 時段管理
- 預約管理
- 操作紀錄

### Phase 5：風險補強

- rate limit
- audit log
- idempotency key
- 錯誤格式統一
- 基本測試

## 14. 建議測試範圍

### 14.1 後端測試

- 建立預約成功
- 同一時段已被預約時建立失敗
- 同一使用者不可重複預約同一時段
- 未登入不能建立預約
- 使用者不能查看他人預約
- 非 admin 不能呼叫 Admin API
- 少於 4 小時開始的預約不可由使用者取消
- 過去時段與 1 小時內開始的時段不可預約
- 取消預約後狀態正確變更
- 預約結束時間已過且未取消時，查詢結果對外顯示為 completed
- 建立與取消預約時需寫入 booking_status_logs
- 重複取消已取消或已完成預約時需回傳穩定錯誤

### 14.2 前端測試

- 訪客可以查看服務列表
- 訪客可以看到已停用服務的停用狀態
- 訪客不會在前台看到隱藏服務
- 訪客點擊預約會被導向登入
- 登入後可以建立預約
- 我的預約只顯示自己的資料
- 非 admin 進入後台會被阻擋
- 後台服務管理可查詢 hidden 服務
- 後台時段管理可查詢、建立、更新時段
- 批次產生時段後可顯示 created / skipped 統計

## 15. 非 MVP 範圍

以下功能可等第二階段再做：

- 線上付款
- Email / SMS 通知
- 多店家 / 多租戶
- 複雜班表排程
- 候補名單
- 優惠券
- 第三方登入
- 即時 WebSocket 更新

## 16. MVP 驗收標準

此 MVP 完成時，應能證明：

- 訪客不用登入即可查看服務與時段
- 已停用服務仍可被查看，且前台清楚顯示不可預約
- 隱藏服務不會出現在前台列表，也不會由公開詳情 API 回傳
- 使用者登入後可以建立與取消自己的預約
- 使用者不可重複預約同一時段
- 一個時段只能有一筆有效預約
- 只允許預約開始時間至少在 1 小時後的時段
- 使用者只能取消 4 小時後才開始的預約
- 管理員可以管理服務、時段與所有預約，且不受會員預約與取消時間限制
- 後端有清楚分層，不是 Controller 直接操作 DB
- PostgreSQL schema 能表達主要業務關係
- 建立預約時能避免超賣或重複預約
- 前後端都有基本錯誤處理
- 權限檢查由後端主導
- 基本資安措施已納入設計