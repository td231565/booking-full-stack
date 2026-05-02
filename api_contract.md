# 預約排程系統 API 契約

## 1. 設計原則

本文件定義預約排程系統 MVP 的 REST API 契約。API 需支援公開服務瀏覽、會員登入與預約、後台管理與稽核紀錄。

設計原則：

- 使用 REST 風格
- Request / response 使用 JSON
- 時間格式使用 ISO 8601
- DB 儲存 UTC，前端依使用者時區顯示
- 登入狀態使用 server-side session 搭配 HttpOnly Cookie
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

- 登入成功後建立 session
- Cookie 存 session token
- Cookie 需設定 HttpOnly、Secure、SameSite=Lax
- DB 只存 `session_token_hash`
- 錯誤訊息不透露帳號是否存在

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

- 將目前 session 的 `revoked_at` 設為目前時間
- 清除 Cookie

Response：

```json
{
  "data": null
}
```

### 5.4 取得目前登入者

```text
GET /api/auth/me
```

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

## 6. Member API

Member API 需要登入，且只能操作自己的資料。

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

Admin API 需要登入且 `role = admin`。

### 7.1 建立服務

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

### 7.2 更新服務

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

### 7.3 建立可預約時段

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

### 7.4 更新可預約時段

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

### 7.5 取得後台預約列表

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

### 7.6 Admin 建立預約

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
- 成功後需寫入 `booking_status_logs` 與 `audit_logs`

### 7.7 Admin 更新預約

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

### 7.8 Admin 更新預約狀態

```text
PATCH /api/admin/bookings/:bookingId/status
```

Request body：

```json
{
  "status": "completed",
  "reason": "服務已完成"
}
```

規則：

- 允許 `confirmed -> completed`
- 允許 `confirmed -> cancelled`
- 成功後需寫入 `booking_status_logs` 與 `audit_logs`

### 7.9 Admin 取消預約

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
- `cancelledBy = admin`
- 成功後需寫入 `booking_status_logs` 與 `audit_logs`

### 7.10 取得稽核紀錄

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

| API 群組 | 是否登入 | 權限 |
| --- | --- | --- |
| Public API | 否 | 訪客可使用 |
| Auth API | 部分需要 | 註冊、登入不需要；登出、me 需要有效 session |
| Member API | 是 | 一般會員只能操作自己的資料 |
| Admin API | 是 | 需要 `role = admin` |

## 9. Rate Limit 建議

| API | 建議 |
| --- | --- |
| POST /api/auth/register | 必須限制，避免大量註冊 |
| POST /api/auth/login | 必須限制，避免暴力破解 |
| POST /api/bookings | 必須限制，避免重複或惡意預約 |
| POST /api/me/bookings/:bookingId/cancel | 必須限制，避免惡意操作 |
| Public API | 建議寬鬆限制，避免被大量查詢 |
| Admin API | 建議限制，並搭配 audit log |

## 10. 暫不納入 MVP

- 圖片上傳 API
- 改期 API
- 線上付款 API
- Email / SMS 通知 API
- 多店家 / 多租戶 API
- 規則式排班 API
- 第三方登入 API
