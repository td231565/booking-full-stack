# 預約排程系統實作計畫

## 1. 實作策略

本專案採用「一起建立骨架，但分順序完成」的方式實作。

不要完全先做完後端再做前端，也不要前後端同時無序開發。比較穩定的節奏是先定義共同契約，再建立前後端骨架，接著用一條完整流程垂直切下去，逐步打通資料庫、API、前端頁面與錯誤處理。

實作時以既有文件為準：

- `MVP_SPEC.md`：產品範圍、業務規則、權限規則與驗收標準
- `db_schema.md`：資料表、狀態定義、索引與交易規則
- `api_contract.md`：API endpoints、request / response、錯誤格式與權限摘要
- `frontend_flow.md`：前端路由、頁面流程、串接方式與 UI 風險控管
- `verification_checklist.md`：各階段完成後的驗證項目與 MVP 驗收清單

## 2. Phase 1：先定義共同契約

狀態：已完成。

目標是讓前後端在開始寫功能前，先有穩定的資料與 API 邊界。

需要確認：

- DB schema：資料表、欄位、enum、constraint、index、關聯與交易規則
- API endpoints：Public、Auth、Member、Admin API 的路徑與方法
- Request / response 格式：成功格式、列表格式、無內容格式與分頁格式
- 錯誤格式：統一使用 `error.code` 與 `error.message`
- 權限規則：訪客、會員、管理員各自能操作的範圍
- 時間規則：DB 儲存 UTC，API 回傳 ISO 8601，前端依使用者時區顯示
- 安全規則：server-side session、HttpOnly Cookie、後端授權檢查、rate limit 範圍

完成條件：

- `db_schema.md` 已能支援 MVP 主要資料流程
- `api_contract.md` 已能描述前後端需要串接的 API
- `frontend_flow.md` 已能對應公開頁、會員頁與後台頁
- 錯誤碼與權限規則沒有明顯衝突

## 3. Phase 2：建立前後端骨架

狀態：已完成。

目標是讓前後端先有可工作的專案結構，但不急著完成所有功能。

後端骨架：

- 建立後端專案與基本設定
- 建立 PostgreSQL 連線設定
- 建立 migration 架構
- 建立共用 API response / error response 格式
- 建立 module / controller / service / repository 分層
- 建立 Auth、ServiceCatalog、Availability、Booking、Admin、AuditLog 等主要 module 空殼
- 建立認證、授權、rate limit 的掛載位置

前端骨架：

- 建立前端專案與基本 layout
- 建立 App Router 頁面路由
- 建立公開頁、會員頁、後台頁的基本版面
- 建立 API client 與錯誤處理基礎
- 建立 auth 狀態取得流程
- 建立共用 UI 元件與 loading / empty / error 狀態

完成條件：

- 前後端專案能啟動
- 前端路由能進入主要頁面
- 後端 module / controller / service 架構已建立
- API response 與 error response 格式已固定
- migration 可以正常執行

## 4. Phase 3：第一條垂直流程，公開服務瀏覽

狀態：已完成。

目標是先完成不需要登入的完整前後端流程，降低認證與權限複雜度。

實作順序：

1. 建立 `services` 與 `availability_slots` migration
2. 建立服務與時段的測試資料或 seed
3. 完成 `GET /api/services`
4. 完成 `GET /api/services/:serviceId`
5. 完成 `GET /api/services/:serviceId/availability`
6. 完成前端 `/services`
7. 完成前端 `/services/:serviceId`
8. 串接服務列表、服務詳情與可預約時段
9. 補上公開頁 loading / empty / error 狀態

此階段要打通：

- 公開服務列表
- 服務詳情
- 可預約時段

此階段不處理：

- 登入
- 建立預約
- 我的預約
- 後台管理

完成條件：

- 訪客不用登入即可查看服務列表
- 訪客可以查看服務詳情
- 訪客可以查看可預約時段
- `hidden` 服務不出現在公開 API
- `inactive` 服務可查看但不可預約
- 可預約時段只回傳符合規則的未來可用時段

## 5. Phase 4：第二條垂直流程，登入與預約

狀態：已完成。

目標是完成會員從註冊、登入到建立與取消自己預約的完整流程。

實作順序：

1. 建立 `users`、`sessions`、`bookings`、`booking_status_logs` migration
2. 完成 `POST /api/auth/register`
3. 完成 `POST /api/auth/login`
4. 完成 `POST /api/auth/logout`
5. 完成 `GET /api/auth/me`
6. 完成前端 `/register`
7. 完成前端 `/login`
8. 在服務詳情頁加入登入導向與建立預約入口
9. 完成 `POST /api/bookings`
10. 完成 `GET /api/me/bookings`
11. 完成 `GET /api/me/bookings/:bookingId`
12. 完成 `POST /api/me/bookings/:bookingId/cancel`
13. 完成前端 `/my/bookings`
14. 完成前端 `/my/bookings/:bookingId`
15. 補上預約成功、預約衝突、重複送出與取消限制的錯誤處理

此階段要打通：

- 註冊
- 登入
- 登出
- 建立預約
- 我的預約
- 取消預約

完成條件：

- 使用者可註冊與登入
- 登入狀態由 server-side session 與 HttpOnly Cookie 維持
- 未登入建立預約時會導向登入
- 登入後可建立自己的預約
- 同一時段只能有一筆有效預約
- 同一會員不可重複預約同一時段
- 使用者只能查看與取消自己的預約
- 使用者只能取消 4 小時後才開始的預約
- 建立與取消預約時會寫入 `booking_status_logs`

## 6. Phase 5：最後做後台

目標是完成管理員維運服務、時段、預約與稽核紀錄的能力。

實作順序：

1. 建立 `audit_logs` migration
2. 建立 Admin guard 與後端 role 檢查
3. 完成後台服務管理 API
4. 完成前端 `/admin/services`
5. 完成後台時段管理 API
6. 完成前端 `/admin/availability`
7. 完成批次產生可預約時段 API
8. 完成後台預約管理 API
9. 完成前端 `/admin/bookings`
10. 完成 audit log 寫入
11. 完成 `GET /api/admin/audit-logs`
12. 完成前端 `/admin/audit-logs`

此階段要打通：

- 服務管理
- 時段管理
- 預約管理
- audit log

完成條件：

- 只有 admin 可以進入後台 API
- Admin 可建立與更新服務
- Admin 可建立、更新、批次產生時段
- Admin 可查看所有預約
- Admin 可替會員建立、更新備註、取消預約
- Admin 不受會員的 1 小時後預約與 4 小時前取消限制
- 後台重要操作會寫入 `audit_logs`

## 7. Phase 6：風險補強與驗收

目標是把已打通的功能補到可驗收狀態。

補強項目：

- rate limit：登入、註冊、建立預約、取消預約、Public API、Admin API
- 錯誤處理：確認所有 API 使用穩定錯誤碼
- 權限測試：確認會員不可查看他人資料，非 admin 不可呼叫 Admin API
- 預約一致性：確認交易、鎖定與 unique constraint 能避免超賣
- 時間規則：確認 UTC 儲存、ISO 8601 回傳、1 小時與 4 小時規則
- SSR / 快取：確認公開頁與私人頁沒有資料外洩風險
- 基本測試：補上高風險流程的後端與前端測試

完成條件：

- 符合 `MVP_SPEC.md` 的 MVP 驗收標準
- 主要流程可從前端完整操作
- 高風險流程有測試或明確驗證方式
- 權限、安全與錯誤處理不只依賴前端

## 8. 建議實作節奏

每個階段都先完成最小可跑版本，再補細節。

建議節奏：

1. 契約先固定
2. 骨架先建起來
3. 先打通公開服務瀏覽
4. 再打通登入與預約
5. 最後打通後台
6. 補強風險、測試與驗收

每次完成一條垂直流程後，都應確認：

- DB schema 是否符合實際資料需求
- API response 是否符合契約
- 前端是否能處理 loading、empty、error
- 權限是否由後端檢查
- 錯誤碼是否足夠讓前端顯示正確狀態
- 是否有需要補測試的高風險情境

階段完成後，需同步對照 `verification_checklist.md` 勾選驗證項目。進入 MVP 驗收前，需重新跑一次完整 checklist。