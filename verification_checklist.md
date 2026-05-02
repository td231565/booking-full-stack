# 預約排程系統 MVP 驗證 Checklist

## 1. 使用方式

此文件用來追蹤各階段完成後的驗證項目。每個階段完成時，應至少跑完該階段 checklist；進入 MVP 驗收前，需再跑一次完整 checklist。

狀態標記：

- `[ ]`：尚未驗證
- `[x]`：已驗證通過
- `[N/A]`：此階段不適用，需補充原因

## 2. Phase 1：共同契約

目標：確認 DB schema、API 契約、錯誤格式、權限與前端流程已能支撐 MVP 實作。

- [ ] `db_schema.md` 已定義 `users`、`services`、`availability_slots`、`bookings`、`booking_status_logs`、`sessions`、`audit_logs`
- [ ] `db_schema.md` 已定義 `user_role`、`user_status`、`service_status`、`availability_slot_status`、`booking_status`、`booking_cancelled_by`
- [ ] `db_schema.md` 已定義主要 constraint 與 partial unique index
- [ ] `api_contract.md` 已定義成功回應、列表回應、無內容回應與錯誤回應格式
- [ ] `api_contract.md` 已定義 Public、Auth、Member、Admin API endpoints
- [ ] `api_contract.md` 已定義穩定錯誤碼與 HTTP status 對應
- [ ] `api_contract.md` 已定義 rate limit 規則
- [ ] `frontend_flow.md` 已定義公開頁、會員頁與後台頁路由
- [ ] `frontend_flow.md` 已定義登入狀態、錯誤處理與 SSR / 快取規則
- [ ] 權限規則已明確區分訪客、會員、管理員
- [ ] 時間規則已明確定義 DB 儲存 UTC、API 回傳 ISO 8601、前端依使用者時區顯示
- [ ] 契約文件之間沒有明顯衝突或未定義欄位

## 3. Phase 2：前後端骨架

目標：確認前後端專案結構、啟動流程、基礎 module、migration 與共用錯誤格式已建立。

- [ ] 前端專案可啟動
- [ ] 後端專案可啟動
- [ ] PostgreSQL 連線設定可正常使用
- [ ] Migration 可從空資料庫完整重建 schema
- [ ] Migration 可重複套用與 rollback，且不留下半套狀態
- [ ] 後端已建立 module / controller / service / repository 分層
- [ ] 後端已建立 Auth、ServiceCatalog、Availability、Booking、Admin、AuditLog 等主要 module 空殼
- [ ] 成功回應格式符合 `api_contract.md` 的 `data` 格式
- [ ] 列表回應格式符合 `data + meta` 格式
- [ ] 錯誤回應格式符合 `error.code + error.message` 格式
- [ ] 前端已建立 App Router 主要頁面路由
- [ ] 前端已建立基本 layout
- [ ] 前端已建立 API client 與錯誤處理基礎
- [ ] 前端已建立 loading / empty / error 狀態基礎

## 4. Phase 3：公開服務瀏覽

目標：確認訪客不登入即可查看公開服務與可預約時段，且服務狀態規則正確。

- [ ] `services` migration 符合 `db_schema.md`
- [ ] `availability_slots` migration 符合 `db_schema.md`
- [ ] `duration_minutes > 0`、`price >= 0`、`end_at > start_at` 等 constraint 正確存在
- [ ] `GET /api/services` 會回傳 `active` 服務
- [ ] `GET /api/services` 會回傳 `inactive` 服務
- [ ] `GET /api/services` 不會回傳 `hidden` 服務
- [ ] `GET /api/services/:serviceId` 可回傳 `active` 服務詳情
- [ ] `GET /api/services/:serviceId` 可回傳 `inactive` 服務詳情
- [ ] `GET /api/services/:serviceId` 不會回傳 `hidden` 服務詳情
- [ ] `inactive` 服務在前端清楚顯示不可預約
- [ ] `GET /api/services/:serviceId/availability` 只回傳 `service.status = active` 的時段
- [ ] `GET /api/services/:serviceId/availability` 只回傳 `slot.status = available` 的時段
- [ ] `GET /api/services/:serviceId/availability` 只回傳開始時間至少在 1 小時後的時段
- [ ] `GET /api/services/:serviceId/availability` 會排除已有非 cancelled booking 的時段
- [ ] 公開頁面不載入會員私人資料
- [ ] 公開頁面快取不會混入 session 相關資料

## 5. Phase 4：會員與預約

目標：確認會員註冊、登入、建立預約、查看自己預約與取消預約流程完整且安全。

- [ ] `users` migration 符合 `db_schema.md`
- [ ] `sessions` migration 符合 `db_schema.md`
- [ ] `bookings` migration 符合 `db_schema.md`
- [ ] `booking_status_logs` migration 符合 `db_schema.md`
- [ ] `users.email` unique index 正確存在
- [ ] `sessions.session_token_hash` unique index 正確存在
- [ ] `bookings.availability_slot_id` partial unique index 能阻擋同一時段多筆非 cancelled 預約
- [ ] `bookings(user_id, availability_slot_id)` partial unique index 能阻擋同一會員重複預約同一時段
- [ ] `POST /api/auth/register` 可建立 `role = user`、`status = active` 的會員
- [ ] 註冊不回傳 `passwordHash`
- [ ] 密碼使用 argon2id hash 後存入 DB
- [ ] `POST /api/auth/login` 成功後建立 server-side session
- [ ] Login Cookie 設定 `HttpOnly`
- [ ] Login Cookie 設定 `Secure`
- [ ] Login Cookie 設定 `SameSite=Lax`
- [ ] DB 只存 `session_token_hash`
- [ ] `GET /api/auth/me` 可依有效 session 回傳目前登入者
- [ ] `POST /api/auth/logout` 會 revoke session 並清除 Cookie
- [ ] 未登入呼叫 `POST /api/bookings` 會回 `401 UNAUTHENTICATED`
- [ ] 會員建立預約時，後端忽略或拒絕前端傳入的 `userId`
- [ ] 會員只能預約 `service.status = active` 的服務
- [ ] 會員只能預約 `slot.status = available` 的時段
- [ ] 會員不可預約過去時段
- [ ] 會員不可預約 1 小時內開始的時段
- [ ] 同時搶同一個 slot 時，只能成功建立一筆有效 booking
- [ ] 同一會員不可重複預約同一時段
- [ ] 會員建立預約成功後，會寫入 `booking_status_logs` 的 `null -> confirmed`
- [ ] `GET /api/me/bookings` 只回傳目前登入者自己的預約
- [ ] `GET /api/me/bookings/:bookingId` 不可取得他人預約，需回 `404`
- [ ] 會員只能取消自己的預約
- [ ] 會員只能取消對外狀態為 `confirmed` 的預約
- [ ] 會員不可取消 4 小時內開始的預約
- [ ] 會員取消預約成功後，會寫入 `booking_status_logs` 的 `confirmed -> cancelled`
- [ ] 已取消預約再次取消時，回 `409 BOOKING_NOT_CANCELABLE`
- [ ] 結束時間已過且未取消的預約，查詢時對外顯示為 `completed`
- [ ] `completed` 不寫入 `booking_status_logs`

## 6. Phase 5：後台管理

目標：確認 Admin 權限、後台服務管理、時段管理、預約管理與 audit log 規則正確。

- [ ] `audit_logs` migration 符合 `db_schema.md`
- [ ] 未登入呼叫 Admin API 會回 `401 UNAUTHENTICATED`
- [ ] 非 admin 呼叫 Admin API 會回 `403 FORBIDDEN`
- [ ] Admin API 權限由後端 `role = admin` 檢查，不只依賴前端 route guard
- [ ] `GET /api/admin/services` 可查詢 `active`、`inactive`、`hidden` 服務
- [ ] `GET /api/admin/services/:serviceId` 可取得 `hidden` 服務詳情
- [ ] Admin 建立服務成功後，寫入 `admin.service.create` audit log
- [ ] Admin 更新服務成功後，寫入 `admin.service.update` audit log
- [ ] Admin 可建立 active 服務的單筆可預約時段
- [ ] Admin 不可替 inactive 或 hidden 服務建立新時段
- [ ] Admin 建立時段時，需驗證時段長度符合服務 `durationMinutes`
- [ ] Admin 建立時段不受會員的 1 小時後預約限制
- [ ] Admin 建立單筆時段成功後，寫入 `admin.availability_slot.create` audit log
- [ ] Admin 更新時段成功後，寫入 `admin.availability_slot.update` audit log
- [ ] Admin 批次產生時段僅支援 `Asia/Taipei`
- [ ] Admin 批次產生時段會跳過已存在時段，不建立重複資料
- [ ] Admin 批次產生時段成功後，回傳 `created` 與 `skipped`
- [ ] Admin 批次產生時段成功後，寫入 `admin.availability_slot.bulk_generate` audit log
- [ ] `GET /api/admin/bookings` 可查詢所有會員預約
- [ ] Admin 可替任意會員建立預約
- [ ] Admin 建立預約不受會員的 1 小時後預約限制
- [ ] Admin 建立預約仍不可造成同一時段多筆有效 booking
- [ ] Admin 建立預約成功後，寫入 `booking_status_logs` 的 `null -> confirmed`
- [ ] Admin 建立預約成功後，寫入 `admin.booking.create` audit log
- [ ] Admin 更新預約備註成功後，寫入 `admin.booking.update` audit log
- [ ] Admin 可取消任意會員對外狀態為 `confirmed` 的預約
- [ ] Admin 取消預約不受會員的 4 小時前取消限制
- [ ] Admin 取消預約成功後，寫入 `booking_status_logs` 的 `confirmed -> cancelled`
- [ ] Admin 取消預約成功後，寫入 `admin.booking.cancel` audit log
- [ ] Admin 重複取消已取消預約時，回 `409 BOOKING_NOT_CANCELABLE`
- [ ] Admin 取消已 completed 預約時，回 `409 BOOKING_NOT_CANCELABLE`
- [ ] MVP 不提供 `PATCH /api/admin/bookings/:bookingId/status`
- [ ] MVP 不提供手動完成預約 API
- [ ] `GET /api/admin/audit-logs` 可查詢指定操作紀錄
- [ ] 查詢類 Admin API 暫不寫入 audit log

## 7. Phase 6：風險補強與驗收

目標：確認 rate limit、錯誤碼、快取、安全與 E2E 驗證足以支撐 MVP 驗收。

- [ ] `POST /api/auth/register` 超過限制時回 `429 RATE_LIMITED`
- [ ] `POST /api/auth/login` 超過限制時回 `429 RATE_LIMITED`
- [ ] 登入 rate limit key 使用 IP + email
- [ ] 登入失敗訊息不透露帳號是否存在
- [ ] `POST /api/bookings` 超過限制時回 `429 RATE_LIMITED`
- [ ] `POST /api/me/bookings/:bookingId/cancel` 超過限制時回 `429 RATE_LIMITED`
- [ ] Public API 超過限制時回 `429 RATE_LIMITED`
- [ ] Admin API 超過限制時回 `429 RATE_LIMITED`
- [ ] 建立預約被 rate limit 擋下時，不可產生 booking
- [ ] 取消預約被 rate limit 擋下時，不可異動 booking
- [ ] 重複送出建立預約請求不會產生多筆有效 booking
- [ ] 前端可依 `error.code` 對應穩定 UI 訊息
- [ ] `BOOKING_SLOT_UNAVAILABLE` 會顯示時段不可預約並刷新 availability
- [ ] `BOOKING_TOO_SOON` 會顯示只能預約 1 小時後的時段
- [ ] `BOOKING_CANCEL_TOO_LATE` 會顯示少於 4 小時不可取消
- [ ] `BOOKING_NOT_CANCELABLE` 會重新取得預約詳情並顯示目前狀態
- [ ] 會員頁使用 no-store 或等效方式避免共享快取
- [ ] 後台頁使用 no-store 或等效方式避免共享快取
- [ ] SSR 不將 session token 或敏感資料注入公開頁
- [ ] Log 不記錄密碼、token、完整 Cookie
- [ ] 錯誤 log 保留 request id
- [ ] E2E 覆蓋公開服務瀏覽
- [ ] E2E 覆蓋登入後建立預約
- [ ] E2E 覆蓋會員取消預約
- [ ] E2E 覆蓋非 admin 被阻擋
- [ ] E2E 覆蓋 admin 建立服務、建立時段、建立預約、取消預約

## 8. 完整性檢查

已對照 `MVP_SPEC.md`、`api_contract.md`、`db_schema.md`、`frontend_flow.md` 與 `implementation_plan.md` 檢查，補齊以下原始建議未明確列出的驗證點：

- [ ] `completed` 為查詢時計算，不提供手動完成 API
- [ ] 會員與 Admin 建立、取消預約都需寫入 `booking_status_logs`
- [ ] Admin 指定操作需寫入對應 `audit_logs.action`
- [ ] 後台可查詢 hidden 服務，但 Public API 不可回傳 hidden 服務
- [ ] MVP 批次產生時段固定 `Asia/Taipei`，暫不處理 DST 日期邊界
- [ ] Admin 取消預約與手動狀態更新 API 不重疊
- [ ] 查詢類 Admin API 暫不寫入 audit log
- [ ] Rate limit 不可取代認證與授權檢查
