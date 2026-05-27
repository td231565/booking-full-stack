# 預約排程系統 API 契約

## 1. 設計原則

本文件定義預約排程系統 MVP 的 REST API 契約。API 需支援公開服務瀏覽、會員登入與預約、後台管理與稽核紀錄。

設計原則：

- 使用 REST 風格
- Request / response 使用 JSON
- 時間格式使用 ISO 8601
- DB 儲存 UTC，前端依使用者時區顯示
- 登入狀態使用 server-side session 搭配 HttpOnly Cookie
- 前台與後台使用**兩顆獨立 Cookie**（`booking_member_session`、`booking_admin_session`），同一瀏覽器可同時持有會員與後台 session；`sessions` 表不加 `audience` 欄，以不同 cookie 對應不同 session 列
- 錯誤回應需提供穩定的 `code`，方便前端判斷 UI 狀態
- 分頁統一使用 `page` 與 `pageSize`

## 2. 共用格式

### 2.1 成功回應

單筆資料：

```json
{
  "data": {
    "id": "uuid"
  }
}
```

列表資料：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

無內容成功：

```json
{
  "data": null
}
```

### 2.2 錯誤回應

```json
{
  "error": {
    "code": "BOOKING_SLOT_UNAVAILABLE",
    "message": "此時段目前不可預約"
  }
}
```

### 2.3 共用 HTTP 狀態碼

- `200 OK`：查詢或更新成功
- `201 Created`：建立成功
- `400 Bad Request`：輸入格式錯誤
- `401 Unauthorized`：未登入
- `403 Forbidden`：權限不足
- `404 Not Found`：資源不存在，或該使用者不可存取該資源
- `409 Conflict`：狀態衝突，例如時段已被預約
- `429 Too Many Requests`：請求過於頻繁
- `500 Internal Server Error`：未預期錯誤

### 2.4 共用錯誤碼

| code | 說明 |
| --- | --- |
| VALIDATION_ERROR | 輸入資料驗證失敗 |
| UNAUTHENTICATED | 尚未登入 |
| FORBIDDEN | 權限不足 |
| RESOURCE_NOT_FOUND | 資源不存在 |
| RATE_LIMITED | 請求過於頻繁 |
| INTERNAL_ERROR | 未預期錯誤 |
| EMAIL_ALREADY_USED | email 已被使用 |
| INVALID_CREDENTIALS | 帳號或密碼錯誤 |
| USER_DISABLED | 帳號已停用 |
| SERVICE_NOT_FOUND | 服務不存在 |
| SERVICE_NOT_ACTIVE | 服務不是啟用狀態 |
| AVAILABILITY_SLOT_NOT_FOUND | 可預約時段不存在 |
| BOOKING_SLOT_NOT_FOUND | 時段不存在 |
| BOOKING_SLOT_UNAVAILABLE | 時段不可預約 |
| BOOKING_TOO_SOON | 不可預約 1 小時內開始的時段 |
| BOOKING_DUPLICATED | 使用者已預約同一時段 |
| BOOKING_NOT_FOUND | 預約不存在 |
| BOOKING_NOT_CANCELABLE | 預約狀態不可取消 |
| BOOKING_CANCEL_TOO_LATE | 距離開始時間少於 4 小時 |
| INVALID_TIME_RANGE | 時間區間格式錯誤 |

### 2.5 預約狀態規則

MVP 階段不提供手動標記完成 API。

預約對外顯示狀態採用以下規則：

- `cancelled`：預約已取消
- `completed`：預約未取消，且 `slot.endAt` 已早於目前伺服器時間
- `confirmed`：預約未取消，且 `slot.endAt` 尚未早於目前伺服器時間

因此，`completed` 在 MVP 可由查詢時計算，不需要由 Admin 手動更新。若後續需要服務人員手動結案、no-show、退款或爭議流程，再新增獨立狀態轉換 API。

### 2.6 Booking Status Log 規則

以下操作必須寫入 `booking_status_logs`：

| 操作 | from_status | to_status | changed_by | reason |
| --- | --- | --- | --- | --- |
| 會員建立預約 | null | confirmed | 目前會員 ID | null |
| Admin 建立預約 | null | confirmed | Admin ID | 可為後台備註 |
| 會員取消預約 | confirmed | cancelled | 目前會員 ID | 會員輸入原因 |
| Admin 取消預約 | confirmed | cancelled | Admin ID | Admin 輸入原因 |

MVP 階段 `completed` 為查詢時計算，因此不寫入 `booking_status_logs`。若第二階段改為實際狀態轉換，再補上 `confirmed -> completed` 的紀錄。

### 2.7 Audit Log 規則

MVP 階段下列後台操作必須寫入 `audit_logs`：

| action | 觸發操作 | targetType | targetId | metadata 建議內容 |
| --- | --- | --- | --- | --- |
| admin.service.create | 建立服務 | service | serviceId | 建立欄位摘要 |
| admin.service.update | 更新服務 | service | serviceId | 變更前後的欄位摘要 |
| admin.availability_slot.create | 建立單筆時段 | availability_slot | slotId | serviceId、startAt、endAt |
| admin.availability_slot.update | 更新時段 | availability_slot | slotId | 變更前後的欄位摘要 |
| admin.availability_slot.bulk_generate | 批次產生時段 | service | serviceId | timezone、dateFrom、dateTo、created、skipped |
| admin.booking.create | Admin 建立預約 | booking | bookingId | userId、availabilitySlotId |
| admin.booking.update | Admin 更新預約備註 | booking | bookingId | 變更前後的 note 摘要 |
| admin.booking.cancel | Admin 取消預約 | booking | bookingId | reason |

會員自行註冊、登入、建立預約與取消預約不寫入 `audit_logs`，但會員建立與取消預約仍需寫入 `booking_status_logs`。登入失敗與 rate limit 事件可先寫應用程式安全 log，MVP 不強制進 `audit_logs`。

### 2.8 Rate Limit 規則

MVP 可先使用記憶體型 rate limit。若部署多個 instance，需改用 Redis 等集中式儲存，否則不同 instance 的計數不會共享。

| API | key 建議 | MVP 建議限制 | 超過限制 |
| --- | --- | --- | --- |
| POST /api/auth/register | IP | 每 10 分鐘 5 次 | 回 `429 RATE_LIMITED` |
| POST /api/auth/login | IP + email | 每 10 分鐘 5 次 | 回 `429 RATE_LIMITED`，不透露帳號是否存在 |
| POST /api/admin/auth/login | IP + email | 每 10 分鐘 5 次 | 同會員登入規則 |
| POST /api/bookings | userId | 每分鐘 5 次 | 回 `429 RATE_LIMITED` |
| POST /api/me/bookings/:bookingId/cancel | userId | 每分鐘 5 次 | 回 `429 RATE_LIMITED` |
| Public API | IP | 每分鐘 120 次 | 回 `429 RATE_LIMITED` |
| Admin API | admin userId | 每分鐘 60 次 | 回 `429 RATE_LIMITED` |

Rate limit 應在認證與授權流程附近處理，但不可取代權限檢查。Admin API 即使有 rate limit，仍必須檢查 `role = admin` 並寫入必要的 `audit_logs`。

## 3. 共用資料物件

### 3.1 User

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "displayName": "王小明",
  "role": "user",
  "status": "active",
  "createdAt": "2026-05-01T02:00:00.000Z"
}
```

### 3.2 Service

```json
{
  "id": "uuid",
  "name": "個人諮詢",
  "description": "一對一諮詢服務",
  "imageUrl": "https://example.com/service.jpg",
  "durationMinutes": 60,
  "price": 1200,
  "status": "active",
  "createdAt": "2026-05-01T02:00:00.000Z",
  "updatedAt": "2026-05-01T02:00:00.000Z"
}
```

### 3.3 AvailabilitySlot

```json
{
  "id": "uuid",
  "serviceId": "uuid",
  "startAt": "2026-05-05T02:00:00.000Z",
  "endAt": "2026-05-05T03:00:00.000Z",
  "status": "available"
}
```

### 3.4 Booking

```json
{
  "id": "uuid",
  "userId": "uuid",
  "serviceId": "uuid",
  "availabilitySlotId": "uuid",
  "status": "confirmed",
  "note": "希望討論職涯方向",
  "cancelledAt": null,
  "cancelledBy": null,
  "cancelReason": null,
  "service": {
    "id": "uuid",
    "name": "個人諮詢",
    "durationMinutes": 60,
    "price": 1200
  },
  "slot": {
    "id": "uuid",
    "startAt": "2026-05-05T02:00:00.000Z",
    "endAt": "2026-05-05T03:00:00.000Z"
  },
  "createdAt": "2026-05-01T02:00:00.000Z",
  "updatedAt": "2026-05-01T02:00:00.000Z"
}
```

## 4. Public API

Public API 不需要登入。

### 4.1 取得服務列表

```text
GET /api/services
```

Query params：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| page | 否 | 頁碼，預設 1 |
| pageSize | 否 | 每頁筆數，預設 20 |

規則：

- 回傳 `active` 與 `inactive` 服務
- 不回傳 `hidden` 服務
- `inactive` 服務需讓前端清楚顯示不可預約

Response：

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "個人諮詢",
      "description": "一對一諮詢服務",
      "imageUrl": "https://example.com/service.jpg",
      "durationMinutes": 60,
      "price": 1200,
      "status": "active"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 4.2 取得服務詳情

```text
GET /api/services/:serviceId
```

規則：

- `active` 可回傳
- `inactive` 可回傳，但不可預約
- `hidden` 不回傳

Response：

```json
{
  "data": {
    "id": "uuid",
    "name": "個人諮詢",
    "description": "一對一諮詢服務",
    "imageUrl": "https://example.com/service.jpg",
    "durationMinutes": 60,
    "price": 1200,
    "status": "active"
  }
}
```

### 4.3 取得服務可預約時段

```text
GET /api/services/:serviceId/availability
```

Query params：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| from | 否 | 起始時間，ISO 8601 |
| to | 否 | 結束時間，ISO 8601 |

規則：

- 只回傳 `service.status = active` 的時段
- 只回傳 `slot.status = available` 的時段
- 只回傳開始時間至少在 1 小時後的時段
- 排除已有非 `cancelled` booking 的時段

Response：

```json
{
  "data": [
    {
      "id": "uuid",
      "serviceId": "uuid",
      "startAt": "2026-05-05T02:00:00.000Z",
      "endAt": "2026-05-05T03:00:00.000Z",
      "status": "available"
    }
  ]
}
```

## 5. Auth API

### 5.1 註冊

```text
POST /api/auth/register
```

Request body：

```json
{
  "email": "user@example.com",
  "password": "password123",
  "displayName": "王小明"
}
```

規則：

- 註冊後直接啟用
- `role` 預設為 `user`
- 密碼需使用 argon2id 雜湊後存入 DB
- 不回傳 `passwordHash`

Response：

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "王小明",
    "role": "user",
    "status": "active"
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| VALIDATION_ERROR | 400 | 輸入格式錯誤 |
| EMAIL_ALREADY_USED | 409 | email 已被使用 |

### 5.2 登入

```text
POST /api/auth/login
```

Request body：

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

規則：

- 登入成功後建立 **member** session
- Set-Cookie 名稱為 `booking_member_session`（不寫入 `booking_admin_session`）
- Cookie 需設定 HttpOnly、Secure、SameSite=Lax
- DB 只存 `session_token_hash`
- 錯誤訊息不透露帳號是否存在
- admin 帳號亦可由此登入取得 member session（用於前台預約）；後台管理須另經 §5.5 後台登入

Response：

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "王小明",
    "role": "user",
    "status": "active"
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| INVALID_CREDENTIALS | 401 | 帳號或密碼錯誤 |
| USER_DISABLED | 403 | 帳號已停用 |
| RATE_LIMITED | 429 | 登入太頻繁 |

### 5.3 登出

```text
POST /api/auth/logout
```

規則：

- 僅讀寫 `booking_member_session`
- 將對應 session 的 `revoked_at` 設為目前時間
- 清除 member Cookie（不影響 `booking_admin_session`）

Response：

```json
{
  "data": null
}
```

### 5.4 取得目前登入者（會員）

```text
GET /api/auth/me
```

規則：

- 僅接受 `booking_member_session`；僅帶 admin cookie 視為未登入（`401 UNAUTHENTICATED`）

Response：

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "王小明",
    "role": "user",
    "status": "active"
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| UNAUTHENTICATED | 401 | 尚未登入 |

### 5.5 後台登入

```text
POST /api/admin/auth/login
```

Request body：同 §5.2（`email`、`password`）。

規則：

- 僅 `role = admin` 且 `status = active` 可成功
- 登入成功後建立 **admin** session，Set-Cookie 為 `booking_admin_session`
- 不寫入 `booking_member_session`
- Cookie 屬性同 §5.2
- 非 admin 帳號回 `403 FORBIDDEN`，且**不** Set admin cookie

Response：同 §5.2（`data` 為 User，通常 `role = admin`）。

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| INVALID_CREDENTIALS | 401 | 帳號或密碼錯誤 |
| FORBIDDEN | 403 | 非 admin 帳號 |
| USER_DISABLED | 403 | 帳號已停用 |
| RATE_LIMITED | 429 | 登入太頻繁 |

### 5.6 後台登出

```text
POST /api/admin/auth/logout
```

規則：

- 僅讀寫 `booking_admin_session`
- 撤銷對應 admin session 並清除 admin Cookie（不影響 member session）

Response：同 §5.3。

### 5.7 取得目前登入者（後台）

```text
GET /api/admin/auth/me
```

規則：

- 僅接受 `booking_admin_session`
- 須為有效 session 且使用者 `role = admin`

Response：同 §5.4。

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| UNAUTHENTICATED | 401 | 無有效 admin session |
| FORBIDDEN | 403 | session 有效但非 admin（異常狀態） |

## 6. Member API

Member API 需要有效 **member** session（`booking_member_session`），且只能操作自己的資料。僅帶 admin cookie 視為未登入。

### 6.1 建立預約

```text
POST /api/bookings
```

Request body：

```json
{
  "availabilitySlotId": "uuid",
  "note": "希望討論職涯方向"
}
```

規則：

- 不接受前端傳入 `userId`
- 使用目前登入者作為 `user_id`
- 只能預約 `service.status = active`
- 只能預約 `slot.status = available`
- 只能預約開始時間至少在 1 小時後的時段
- 同一時段只能有一筆有效預約
- 同一會員不可重複預約同一時段
- 成功後 `status = confirmed`
- 成功後需寫入 `booking_status_logs`，記錄 `null -> confirmed`

Response：

```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "serviceId": "uuid",
    "availabilitySlotId": "uuid",
    "status": "confirmed",
    "note": "希望討論職涯方向",
    "createdAt": "2026-05-01T02:00:00.000Z"
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| UNAUTHENTICATED | 401 | 尚未登入 |
| BOOKING_SLOT_NOT_FOUND | 404 | 時段不存在 |
| BOOKING_SLOT_UNAVAILABLE | 409 | 時段不可預約 |
| BOOKING_TOO_SOON | 409 | 不可預約 1 小時內開始的時段 |
| BOOKING_DUPLICATED | 409 | 使用者已預約同一時段 |

### 6.2 取得我的預約列表

```text
GET /api/me/bookings
```

Query params：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| page | 否 | 頁碼，預設 1 |
| pageSize | 否 | 每頁筆數，預設 20 |
| status | 否 | confirmed、cancelled、completed |

規則：

- `completed` 為查詢時計算狀態：預約未取消，且 `slot.endAt` 早於目前伺服器時間
- 使用 `status=completed` 篩選時，回傳符合上述條件的預約

Response：

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "confirmed",
      "service": {
        "id": "uuid",
        "name": "個人諮詢",
        "durationMinutes": 60,
        "price": 1200
      },
      "slot": {
        "id": "uuid",
        "startAt": "2026-05-05T02:00:00.000Z",
        "endAt": "2026-05-05T03:00:00.000Z"
      },
      "createdAt": "2026-05-01T02:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 6.3 取得我的預約詳情

```text
GET /api/me/bookings/:bookingId
```

規則：

- 只能取得目前登入者自己的預約
- 若預約存在但不屬於目前登入者，回傳 `404`

Response：

```json
{
  "data": {
    "id": "uuid",
    "status": "confirmed",
    "note": "希望討論職涯方向",
    "cancelledAt": null,
    "cancelledBy": null,
    "cancelReason": null,
    "service": {
      "id": "uuid",
      "name": "個人諮詢",
      "durationMinutes": 60,
      "price": 1200
    },
    "slot": {
      "id": "uuid",
      "startAt": "2026-05-05T02:00:00.000Z",
      "endAt": "2026-05-05T03:00:00.000Z"
    },
    "createdAt": "2026-05-01T02:00:00.000Z",
    "updatedAt": "2026-05-01T02:00:00.000Z"
  }
}
```

### 6.4 取消我的預約

```text
POST /api/me/bookings/:bookingId/cancel
```

Request body：

```json
{
  "reason": "臨時有事"
}
```

規則：

- 只能取消自己的預約
- 只能取消 `status = confirmed` 的預約
- 只能取消開始時間至少在 4 小時後的預約
- 成功後更新為 `status = cancelled`
- `cancelledBy = user`
- 成功後需寫入 `booking_status_logs`，記錄 `confirmed -> cancelled`

Response：

```json
{
  "data": {
    "id": "uuid",
    "status": "cancelled",
    "cancelledBy": "user",
    "cancelReason": "臨時有事",
    "cancelledAt": "2026-05-01T02:00:00.000Z"
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| BOOKING_NOT_FOUND | 404 | 預約不存在 |
| BOOKING_NOT_CANCELABLE | 409 | 預約狀態不可取消 |
| BOOKING_CANCEL_TOO_LATE | 409 | 距離開始時間少於 4 小時 |

## 7. Admin API

Admin API 需要有效 **admin** session（`booking_admin_session`）且 `role = admin`。僅帶 member cookie 視為未登入（`401 UNAUTHENTICATED`），即使有 admin 身分的使用者亦須先完成 §5.5 後台登入。

### 7.1 取得後台服務列表

```text
GET /api/admin/services
```

Query params：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| page | 否 | 頁碼，預設 1 |
| pageSize | 否 | 每頁筆數，預設 20 |
| status | 否 | active、inactive、hidden |

規則：

- 後台可查詢 `active`、`inactive`、`hidden` 服務
- 用於後台服務管理與時段管理的服務選單

Response：

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "個人諮詢",
      "description": "一對一諮詢服務",
      "imageUrl": "https://example.com/service.jpg",
      "durationMinutes": 60,
      "price": 1200,
      "status": "active",
      "createdAt": "2026-05-01T02:00:00.000Z",
      "updatedAt": "2026-05-01T02:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 7.2 取得後台服務詳情

```text
GET /api/admin/services/:serviceId
```

規則：

- 後台可取得 `active`、`inactive`、`hidden` 服務詳情

Response：

```json
{
  "data": {
    "id": "uuid",
    "name": "個人諮詢",
    "description": "一對一諮詢服務",
    "imageUrl": "https://example.com/service.jpg",
    "durationMinutes": 60,
    "price": 1200,
    "status": "active",
    "createdAt": "2026-05-01T02:00:00.000Z",
    "updatedAt": "2026-05-01T02:00:00.000Z"
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| SERVICE_NOT_FOUND | 404 | 服務不存在 |

### 7.3 建立服務

```text
POST /api/admin/services
```

Request body：

```json
{
  "name": "個人諮詢",
  "description": "一對一諮詢服務",
  "imageUrl": "https://example.com/service.jpg",
  "durationMinutes": 60,
  "price": 1200,
  "status": "active"
}
```

Response：

```json
{
  "data": {
    "id": "uuid",
    "name": "個人諮詢",
    "description": "一對一諮詢服務",
    "imageUrl": "https://example.com/service.jpg",
    "durationMinutes": 60,
    "price": 1200,
    "status": "active",
    "createdAt": "2026-05-01T02:00:00.000Z",
    "updatedAt": "2026-05-01T02:00:00.000Z"
  }
}
```

規則：

- 成功後需寫入 `audit_logs`，action 為 `admin.service.create`

### 7.4 更新服務

```text
PATCH /api/admin/services/:serviceId
```

Request body：

```json
{
  "name": "個人諮詢",
  "description": "更新後的說明",
  "imageUrl": "https://example.com/service.jpg",
  "durationMinutes": 60,
  "price": 1500,
  "status": "inactive"
}
```

規則：

- `status = inactive` 時，前台仍顯示但不可預約
- `status = hidden` 時，前台列表與公開詳情 API 不回傳
- 已有預約的服務不應直接刪除
- 成功後需寫入 `audit_logs`，action 為 `admin.service.update`

### 7.5 取得後台可預約時段列表

```text
GET /api/admin/availability-slots
```

Query params：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| page | 否 | 頁碼，預設 1 |
| pageSize | 否 | 每頁筆數，預設 20 |
| serviceId | 否 | 依服務篩選 |
| status | 否 | available、blocked、inactive |
| from | 否 | 依時段開始時間篩選，ISO 8601 |
| to | 否 | 依時段開始時間篩選，ISO 8601 |

規則：

- 後台可查詢所有服務狀態下的時段
- 回傳資料需包含服務基本資訊，方便後台列表顯示與篩選

Response：

```json
{
  "data": [
    {
      "id": "uuid",
      "serviceId": "uuid",
      "startAt": "2026-05-05T02:00:00.000Z",
      "endAt": "2026-05-05T03:00:00.000Z",
      "status": "available",
      "service": {
        "id": "uuid",
        "name": "個人諮詢",
        "durationMinutes": 60,
        "status": "active"
      }
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 7.6 取得後台可預約時段詳情

```text
GET /api/admin/availability-slots/:slotId
```

Response：

```json
{
  "data": {
    "id": "uuid",
    "serviceId": "uuid",
    "startAt": "2026-05-05T02:00:00.000Z",
    "endAt": "2026-05-05T03:00:00.000Z",
    "status": "available",
    "service": {
      "id": "uuid",
      "name": "個人諮詢",
      "durationMinutes": 60,
      "status": "active"
    }
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| AVAILABILITY_SLOT_NOT_FOUND | 404 | 可預約時段不存在 |

### 7.7 建立可預約時段

```text
POST /api/admin/availability-slots
```

Request body：

```json
{
  "serviceId": "uuid",
  "startAt": "2026-05-05T02:00:00.000Z",
  "endAt": "2026-05-05T03:00:00.000Z",
  "status": "available"
}
```

規則：

- 服務必須是 `active`
- `endAt` 必須晚於 `startAt`
- 時段長度需符合服務的 `durationMinutes`
- 管理員建立時段不受會員的「1 小時後可預約」限制
- 成功後需寫入 `audit_logs`，action 為 `admin.availability_slot.create`

### 7.8 更新可預約時段

```text
PATCH /api/admin/availability-slots/:slotId
```

Request body：

```json
{
  "startAt": "2026-05-05T02:00:00.000Z",
  "endAt": "2026-05-05T03:00:00.000Z",
  "status": "blocked"
}
```

規則：

- 若時段已有有效預約，需避免直接改成會造成資料不一致的時間
- 若需要取消既有預約，應透過 Admin 取消預約 API
- 成功後需寫入 `audit_logs`，action 為 `admin.availability_slot.update`

### 7.9 批次產生可預約時段

```text
POST /api/admin/availability-slots/bulk-generate
```

Request body：

```json
{
  "serviceId": "uuid",
  "timezone": "Asia/Taipei",
  "dateFrom": "2026-05-01",
  "dateTo": "2026-05-31",
  "weekdays": [1, 2, 3, 4, 5],
  "timeRanges": [
    {
      "startTime": "09:00",
      "endTime": "12:00"
    },
    {
      "startTime": "14:00",
      "endTime": "18:00"
    }
  ]
}
```

規則：

- 服務必須是 `active`
- `timezone` 表示後台輸入時間的時區，MVP 預設使用 `Asia/Taipei`
- `weekdays` 使用 ISO weekday，`1 = Monday`，`7 = Sunday`
- `durationMinutes` 不由前端傳入，後端使用服務設定的 `durationMinutes` 切分時段
- 後端需將本地日期時間轉成 UTC 後存入 DB
- 若產生的時段已存在，應跳過而不是建立重複資料
- 管理員批次產生時段不受會員的「1 小時後可預約」限制
- 成功後需寫入 `audit_logs`，action 為 `admin.availability_slot.bulk_generate`
- MVP 僅支援 `timezone = Asia/Taipei`；Asia/Taipei 沒有日光節約時間，暫不處理 DST 造成的不存在或重複本地時間

Response：

```json
{
  "data": {
    "created": 80,
    "skipped": 4
  }
}
```

可能錯誤：

| code | HTTP | 說明 |
| --- | --- | --- |
| SERVICE_NOT_FOUND | 404 | 服務不存在 |
| SERVICE_NOT_ACTIVE | 409 | 服務不是啟用狀態 |
| INVALID_TIME_RANGE | 400 | 時間區間格式錯誤 |
| VALIDATION_ERROR | 400 | 輸入資料驗證失敗 |

### 7.10 取得後台預約列表

```text
GET /api/admin/bookings
```

Query params：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| page | 否 | 頁碼，預設 1 |
| pageSize | 否 | 每頁筆數，預設 20 |
| status | 否 | confirmed、cancelled、completed |
| serviceId | 否 | 依服務篩選 |
| userId | 否 | 依會員篩選 |
| from | 否 | 依時段開始時間篩選，ISO 8601 |
| to | 否 | 依時段開始時間篩選，ISO 8601 |

規則：

- `completed` 為查詢時計算狀態：預約未取消，且 `slot.endAt` 早於目前伺服器時間
- 使用 `status=completed` 篩選時，回傳符合上述條件的預約

Response：

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "confirmed",
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "displayName": "王小明"
      },
      "service": {
        "id": "uuid",
        "name": "個人諮詢"
      },
      "slot": {
        "id": "uuid",
        "startAt": "2026-05-05T02:00:00.000Z",
        "endAt": "2026-05-05T03:00:00.000Z"
      },
      "createdAt": "2026-05-01T02:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 7.11 Admin 建立預約

```text
POST /api/admin/bookings
```

Request body：

```json
{
  "userId": "uuid",
  "availabilitySlotId": "uuid",
  "note": "電話代約"
}
```

規則：

- Admin 可替任意會員建立預約
- 不受「1 小時後可預約」限制
- 仍需避免同一時段產生多筆有效預約
- 成功後需寫入 `booking_status_logs`，記錄 `null -> confirmed`
- 成功後需寫入 `audit_logs`，action 為 `admin.booking.create`

### 7.12 Admin 更新預約

```text
PATCH /api/admin/bookings/:bookingId
```

Request body：

```json
{
  "note": "更新後台備註"
}
```

規則：

- MVP 先只開放更新 `note`
- 若要調整時段，建議第二階段再加入改期 API，避免 MVP 預約一致性過度複雜
- 成功後需寫入 `audit_logs`，action 為 `admin.booking.update`

### 7.13 Admin 取消預約

```text
POST /api/admin/bookings/:bookingId/cancel
```

Request body：

```json
{
  "reason": "管理員取消"
}
```

規則：

- 可取消任意會員預約
- 不受「4 小時前可取消」限制
- 只能取消對外狀態為 `confirmed` 的預約
- `cancelledBy = admin`
- 成功後需寫入 `booking_status_logs`，記錄 `confirmed -> cancelled`
- 成功後需寫入 `audit_logs`，action 為 `admin.booking.cancel`

重複取消情境：

- 使用者或 Admin 連續點擊取消按鈕
- 前端重試同一個取消請求
- 會員與 Admin 幾乎同時取消同一筆預約

若預約已是 `cancelled`，再次取消應回 `409 BOOKING_NOT_CANCELABLE`。若預約已因時間經過對外顯示為 `completed`，Admin 取消也應回 `409 BOOKING_NOT_CANCELABLE`。

### 7.14 取得稽核紀錄

```text
GET /api/admin/audit-logs
```

Query params：

| 參數 | 必填 | 說明 |
| --- | --- | --- |
| page | 否 | 頁碼，預設 1 |
| pageSize | 否 | 每頁筆數，預設 20 |
| actorUserId | 否 | 依操作者篩選 |
| targetType | 否 | 依操作對象類型篩選 |
| targetId | 否 | 依操作對象 ID 篩選 |
| from | 否 | 起始時間，ISO 8601 |
| to | 否 | 結束時間，ISO 8601 |

Response：

```json
{
  "data": [
    {
      "id": "uuid",
      "actorUserId": "uuid",
      "action": "admin.booking.cancel",
      "targetType": "booking",
      "targetId": "uuid",
      "metadata": {
        "reason": "管理員取消"
      },
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0",
      "createdAt": "2026-05-01T02:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## 8. 權限摘要

| API 群組 | 是否登入 | Cookie | 權限 |
| --- | --- | --- | --- |
| Public API | 否 | — | 訪客可使用 |
| Auth API（會員） | 部分需要 | `booking_member_session` | 註冊、會員登入不需要；會員登出、`/api/auth/me` 需要有效 member session |
| Admin Auth API | 部分需要 | `booking_admin_session` | 後台登入不需要；後台登出、`/api/admin/auth/me` 需要有效 admin session |
| Member API | 是 | `booking_member_session` | 一般會員只能操作自己的資料 |
| Admin API | 是 | `booking_admin_session` | 需要 `role = admin` |

## 9. Rate Limit 建議

Rate limit 的 key、限制值與超過限制時的回應，統一依照 `2.8 Rate Limit 規則`。

驗證重點：

- 達到限制後回 `429 RATE_LIMITED`
- 登入失敗不可透露帳號是否存在
- 建立與取消預約被限制時，不可產生資料異動
- Admin API 被限制時，不可跳過原本的 `role = admin` 權限檢查

## 10. 暫不納入 MVP

- 圖片上傳 API
- 改期 API
- 手動完成預約 API
- 線上付款 API
- Email / SMS 通知 API
- 多店家 / 多租戶 API
- 第三方登入 API
