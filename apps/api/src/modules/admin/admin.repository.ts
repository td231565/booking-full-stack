import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export type AdminServiceStatus = 'active' | 'inactive' | 'hidden';
export type AdminSlotStatus = 'available' | 'blocked' | 'inactive';
export type AdminBookingStatus = 'confirmed' | 'cancelled' | 'completed';

export type AdminServiceRecord = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  durationMinutes: number;
  price: number;
  status: AdminServiceStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminSlotRecord = {
  id: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  status: AdminSlotStatus;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    status: AdminServiceStatus;
  };
};

export type AdminBookingRecord = {
  id: string;
  status: AdminBookingStatus;
  note: string | null;
  cancelledAt: Date | null;
  cancelledBy: 'user' | 'admin' | null;
  cancelReason: string | null;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  service: {
    id: string;
    name: string;
  };
  slot: {
    id: string;
    startAt: Date;
    endAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type CreatedAdminBookingRecord = {
  id: string;
  userId: string;
  serviceId: string;
  availabilitySlotId: string;
  status: 'confirmed';
  note: string | null;
  createdAt: Date;
};

export type CancelledAdminBookingRecord = {
  id: string;
  status: 'cancelled';
  cancelledBy: 'admin';
  cancelReason: string | null;
  cancelledAt: Date;
};

export type AdminUserLookupRecord = {
  id: string;
  email: string;
  displayName: string;
};

type SlotForAdminBooking = {
  id: string;
  serviceId: string;
  serviceStatus: AdminServiceStatus;
  slotStatus: AdminSlotStatus;
};

type BookingForAdminCancel = {
  id: string;
  status: 'confirmed' | 'cancelled';
  endAt: Date;
};

@Injectable()
export class AdminRepository {
  // 注入 DataSource，集中封裝後台服務、時段、預約與 audit log 的 SQL 操作。
  constructor(private readonly dataSource: DataSource) {}

  // 建立 QueryRunner，讓 service 用交易保護 booking 與 audit log 一致性。
  createQueryRunner(): QueryRunner {
    return this.dataSource.createQueryRunner();
  }

  // 查詢後台服務列表，包含 hidden 服務以供管理。
  async findServices(page: number, pageSize: number, status: AdminServiceStatus | undefined): Promise<{ items: AdminServiceRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const statusSql = status ? 'WHERE status = $3' : '';
    const params = status ? [pageSize, offset, status] : [pageSize, offset];
    const rows = await this.dataSource.query<AdminServiceRecord[]>(
      `
        SELECT
          id,
          name,
          description,
          image_url AS "imageUrl",
          duration_minutes AS "durationMinutes",
          price,
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM services
        ${statusSql}
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2
      `,
      params,
    );
    const [{ total }] = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total FROM services ${status ? 'WHERE status = $1' : ''}`,
      status ? [status] : [],
    );

    return {
      items: rows,
      total: Number(total),
    };
  }

  // 依 ID 查詢服務，後台需能取得 hidden 服務。
  async findServiceById(serviceId: string): Promise<AdminServiceRecord | null> {
    const rows = await this.dataSource.query<AdminServiceRecord[]>(
      `
        SELECT
          id,
          name,
          description,
          image_url AS "imageUrl",
          duration_minutes AS "durationMinutes",
          price,
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM services
        WHERE id = $1
        LIMIT 1
      `,
      [serviceId],
    );

    return rows[0] ?? null;
  }

  // 建立服務並回傳完整後台服務資料。
  async insertService(input: {
    name: string;
    description: string | null;
    imageUrl: string | null;
    durationMinutes: number;
    price: number;
    status: AdminServiceStatus;
  }): Promise<AdminServiceRecord> {
    const rows = await this.dataSource.query<AdminServiceRecord[]>(
      `
        INSERT INTO services (name, description, image_url, duration_minutes, price, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          name,
          description,
          image_url AS "imageUrl",
          duration_minutes AS "durationMinutes",
          price,
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [input.name, input.description, input.imageUrl, input.durationMinutes, input.price, input.status],
    );

    return rows[0];
  }

  // 更新服務欄位；undefined 表示保持原值，null 可清空 nullable 欄位。
  async updateService(
    serviceId: string,
    input: Partial<{
      name: string;
      description: string | null;
      imageUrl: string | null;
      durationMinutes: number;
      price: number;
      status: AdminServiceStatus;
    }>,
  ): Promise<AdminServiceRecord | null> {
    const rows = await this.dataSource.query<AdminServiceRecord[]>(
      `
        UPDATE services
        SET
          name = COALESCE($2, name),
          description = CASE WHEN $3::boolean THEN $4 ELSE description END,
          image_url = CASE WHEN $5::boolean THEN $6 ELSE image_url END,
          duration_minutes = COALESCE($7, duration_minutes),
          price = COALESCE($8, price),
          status = COALESCE($9, status),
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          name,
          description,
          image_url AS "imageUrl",
          duration_minutes AS "durationMinutes",
          price,
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        serviceId,
        input.name,
        Object.prototype.hasOwnProperty.call(input, 'description'),
        input.description,
        Object.prototype.hasOwnProperty.call(input, 'imageUrl'),
        input.imageUrl,
        input.durationMinutes,
        input.price,
        input.status,
      ],
    );

    return this.firstQueryRunnerRow(rows) ?? null;
  }

  // 查詢後台時段列表，可依服務、狀態與開始時間區間篩選。
  async findAvailabilitySlots(
    page: number,
    pageSize: number,
    filters: { serviceId?: string; status?: AdminSlotStatus; from?: Date; to?: Date },
  ): Promise<{ items: AdminSlotRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const where = this.buildSlotWhere(filters);
    const rows = await this.dataSource.query<AdminSlotRecord[]>(
      `
        SELECT
          slot.id,
          slot.service_id AS "serviceId",
          slot.start_at AS "startAt",
          slot.end_at AS "endAt",
          slot.status,
          json_build_object(
            'id', service.id,
            'name', service.name,
            'durationMinutes', service.duration_minutes,
            'status', service.status
          ) AS service
        FROM availability_slots slot
        INNER JOIN services service ON service.id = slot.service_id
        ${where.sql}
        ORDER BY slot.start_at DESC, slot.id DESC
        LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}
      `,
      [...where.params, pageSize, offset],
    );
    const [{ total }] = await this.dataSource.query<Array<{ total: string }>>(
      `
        SELECT COUNT(*)::text AS total
        FROM availability_slots slot
        INNER JOIN services service ON service.id = slot.service_id
        ${where.sql}
      `,
      where.params,
    );

    return {
      items: rows,
      total: Number(total),
    };
  }

  // 查詢單一後台時段詳情，包含服務基本資訊。
  async findAvailabilitySlotById(slotId: string): Promise<AdminSlotRecord | null> {
    const rows = await this.dataSource.query<AdminSlotRecord[]>(
      `
        SELECT
          slot.id,
          slot.service_id AS "serviceId",
          slot.start_at AS "startAt",
          slot.end_at AS "endAt",
          slot.status,
          json_build_object(
            'id', service.id,
            'name', service.name,
            'durationMinutes', service.duration_minutes,
            'status', service.status
          ) AS service
        FROM availability_slots slot
        INNER JOIN services service ON service.id = slot.service_id
        WHERE slot.id = $1
        LIMIT 1
      `,
      [slotId],
    );

    return rows[0] ?? null;
  }

  // 建立單筆時段，service 層會先驗證服務狀態與時長。
  async insertAvailabilitySlot(serviceId: string, startAt: Date, endAt: Date, status: AdminSlotStatus): Promise<AdminSlotRecord> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `
        INSERT INTO availability_slots (service_id, start_at, end_at, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [serviceId, startAt, endAt, status],
    );

    return this.findAvailabilitySlotById(rows[0].id) as Promise<AdminSlotRecord>;
  }

  // 更新單筆時段；undefined 表示保持原值。
  async updateAvailabilitySlot(
    slotId: string,
    input: Partial<{ startAt: Date; endAt: Date; status: AdminSlotStatus }>,
  ): Promise<AdminSlotRecord | null> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `
        UPDATE availability_slots
        SET
          start_at = COALESCE($2, start_at),
          end_at = COALESCE($3, end_at),
          status = COALESCE($4, status),
          updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [slotId, input.startAt, input.endAt, input.status],
    );

    const updated = this.firstQueryRunnerRow(rows);
    return updated ? this.findAvailabilitySlotById(updated.id) : null;
  }

  // 檢查指定服務與開始時間是否已有時段，用於批次產生跳過重複資料。
  async hasAvailabilitySlot(serviceId: string, startAt: Date): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `
        SELECT EXISTS (
          SELECT 1 FROM availability_slots WHERE service_id = $1 AND start_at = $2
        ) AS "exists"
      `,
      [serviceId, startAt],
    );

    return rows[0]?.exists ?? false;
  }

  // 判斷時段是否已有非 cancelled 預約，避免更新時間造成預約與 slot 不一致。
  async hasActiveBookingForSlot(slotId: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `
        SELECT EXISTS (
          SELECT 1 FROM bookings WHERE availability_slot_id = $1 AND status <> 'cancelled'
        ) AS "exists"
      `,
      [slotId],
    );

    return rows[0]?.exists ?? false;
  }

  // 查詢所有會員預約，Admin 可依狀態、服務、會員與時間區間篩選。
  async findBookings(
    page: number,
    pageSize: number,
    filters: { status?: AdminBookingStatus; serviceId?: string; userId?: string; from?: Date; to?: Date },
  ): Promise<{ items: AdminBookingRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const where = this.buildBookingWhere(filters);
    const rows = await this.dataSource.query<AdminBookingRecord[]>(
      `
        SELECT
          b.id,
          ${this.externalBookingStatusSql()} AS status,
          b.note,
          b.cancelled_at AS "cancelledAt",
          b.cancelled_by AS "cancelledBy",
          b.cancel_reason AS "cancelReason",
          json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name) AS "user",
          json_build_object('id', service.id, 'name', service.name) AS service,
          json_build_object('id', slot.id, 'startAt', slot.start_at, 'endAt', slot.end_at) AS slot,
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt"
        FROM bookings b
        INNER JOIN users u ON u.id = b.user_id
        INNER JOIN services service ON service.id = b.service_id
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        ${where.sql}
        ORDER BY slot.start_at DESC, b.created_at DESC
        LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}
      `,
      [...where.params, pageSize, offset],
    );
    const [{ total }] = await this.dataSource.query<Array<{ total: string }>>(
      `
        SELECT COUNT(*)::text AS total
        FROM bookings b
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        ${where.sql}
      `,
      where.params,
    );

    return {
      items: rows,
      total: Number(total),
    };
  }

  // 鎖定時段供 Admin 建立預約，仍需避免同一時段多筆有效預約。
  async findSlotForAdminBooking(queryRunner: QueryRunner, slotId: string): Promise<SlotForAdminBooking | null> {
    const rows = (await queryRunner.query(
      `
        SELECT
          slot.id,
          slot.service_id AS "serviceId",
          service.status AS "serviceStatus",
          slot.status AS "slotStatus"
        FROM availability_slots slot
        INNER JOIN services service ON service.id = slot.service_id
        WHERE slot.id = $1
        FOR UPDATE OF slot
      `,
      [slotId],
    )) as SlotForAdminBooking[];

    return rows[0] ?? null;
  }

  // 依 email 查詢 active 會員，供後台新增預約前確認會員身分。
  async findActiveUserByEmail(email: string): Promise<AdminUserLookupRecord | null> {
    const rows = await this.dataSource.query<AdminUserLookupRecord[]>(
      `
        SELECT
          id,
          email,
          display_name AS "displayName"
        FROM users
        WHERE lower(email) = lower($1) AND status = 'active'
        LIMIT 1
      `,
      [email],
    );

    return rows[0] ?? null;
  }

  // 確認 Admin 指定的會員存在且可使用。
  async hasActiveUser(queryRunner: QueryRunner, userId: string): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT EXISTS (
          SELECT 1 FROM users WHERE id = $1 AND status = 'active'
        ) AS "exists"
      `,
      [userId],
    )) as Array<{ exists: boolean }>;

    return rows[0]?.exists ?? false;
  }

  // 檢查該時段是否已有非 cancelled booking，避免 Admin 建立預約造成超賣。
  async hasActiveBookingForSlotInTransaction(queryRunner: QueryRunner, slotId: string): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT EXISTS (
          SELECT 1 FROM bookings WHERE availability_slot_id = $1 AND status <> 'cancelled'
        ) AS "exists"
      `,
      [slotId],
    )) as Array<{ exists: boolean }>;

    return rows[0]?.exists ?? false;
  }

  // Admin 建立 confirmed booking，userId 來自後台 request body。
  async insertAdminBooking(
    queryRunner: QueryRunner,
    userId: string,
    serviceId: string,
    slotId: string,
    note: string | null,
  ): Promise<CreatedAdminBookingRecord> {
    const rows = (await queryRunner.query(
      `
        INSERT INTO bookings (user_id, service_id, availability_slot_id, status, note)
        VALUES ($1, $2, $3, 'confirmed', $4)
        RETURNING
          id,
          user_id AS "userId",
          service_id AS "serviceId",
          availability_slot_id AS "availabilitySlotId",
          status,
          note,
          created_at AS "createdAt"
      `,
      [userId, serviceId, slotId, note],
    )) as CreatedAdminBookingRecord[];

    return this.firstQueryRunnerRow(rows);
  }

  // Admin 更新預約備註，MVP 不提供改期或手動狀態更新。
  async updateBookingNote(bookingId: string, note: string | null): Promise<AdminBookingRecord | null> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `
        UPDATE bookings
        SET note = $2, updated_at = now()
        WHERE id = $1
        RETURNING id
      `,
      [bookingId, note],
    );

    const updated = this.firstQueryRunnerRow(rows);
    return updated ? this.findBookingById(updated.id) : null;
  }

  // 查詢單筆 booking，用於更新後回傳與 audit metadata。
  async findBookingById(bookingId: string): Promise<AdminBookingRecord | null> {
    const rows = await this.dataSource.query<AdminBookingRecord[]>(
      `
        SELECT
          b.id,
          ${this.externalBookingStatusSql()} AS status,
          b.note,
          b.cancelled_at AS "cancelledAt",
          b.cancelled_by AS "cancelledBy",
          b.cancel_reason AS "cancelReason",
          json_build_object('id', u.id, 'email', u.email, 'displayName', u.display_name) AS "user",
          json_build_object('id', service.id, 'name', service.name) AS service,
          json_build_object('id', slot.id, 'startAt', slot.start_at, 'endAt', slot.end_at) AS slot,
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt"
        FROM bookings b
        INNER JOIN users u ON u.id = b.user_id
        INNER JOIN services service ON service.id = b.service_id
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        WHERE b.id = $1
        LIMIT 1
      `,
      [bookingId],
    );

    return rows[0] ?? null;
  }

  // 鎖定預約供 Admin 取消，需排除已取消與已 completed 的預約。
  async findBookingForAdminCancel(queryRunner: QueryRunner, bookingId: string): Promise<BookingForAdminCancel | null> {
    const rows = (await queryRunner.query(
      `
        SELECT
          b.id,
          b.status,
          slot.end_at AS "endAt"
        FROM bookings b
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        WHERE b.id = $1
        FOR UPDATE OF b
      `,
      [bookingId],
    )) as BookingForAdminCancel[];

    return rows[0] ?? null;
  }

  // Admin 取消任意會員預約，不套用會員 4 小時限制。
  async cancelAdminBooking(queryRunner: QueryRunner, bookingId: string, reason: string | null): Promise<CancelledAdminBookingRecord> {
    const rows = (await queryRunner.query(
      `
        UPDATE bookings
        SET
          status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = 'admin',
          cancel_reason = $2,
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          status,
          cancelled_by AS "cancelledBy",
          cancel_reason AS "cancelReason",
          cancelled_at AS "cancelledAt"
      `,
      [bookingId, reason],
    )) as CancelledAdminBookingRecord[];

    return this.firstQueryRunnerRow(rows);
  }

  // 寫入 booking 狀態轉換紀錄，Admin 建立與取消預約都需保留歷史。
  async insertBookingStatusLog(
    queryRunner: QueryRunner,
    bookingId: string,
    fromStatus: 'confirmed' | null,
    toStatus: 'confirmed' | 'cancelled',
    changedBy: string,
    reason: string | null,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO booking_status_logs (booking_id, from_status, to_status, changed_by, reason)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [bookingId, fromStatus, toStatus, changedBy, reason],
    );
  }

  // 寫入 audit_logs；查詢類 Admin API 不呼叫此方法。
  async insertAuditLog(
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string | null,
    metadata: Record<string, unknown> | null,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.dataSource.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [actorUserId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null, ipAddress, userAgent],
    );
  }

  // 在交易內寫入 audit_logs，確保 booking 異動與稽核紀錄一起提交。
  async insertAuditLogInTransaction(
    queryRunner: QueryRunner,
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string | null,
    metadata: Record<string, unknown> | null,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [actorUserId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null, ipAddress, userAgent],
    );
  }

  // 建立 slot 查詢條件，統一產生安全的 positional parameters。
  private buildSlotWhere(filters: { serviceId?: string; status?: AdminSlotStatus; from?: Date; to?: Date }): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.serviceId) {
      params.push(filters.serviceId);
      conditions.push(`slot.service_id = $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`slot.status = $${params.length}`);
    }

    if (filters.from) {
      params.push(filters.from);
      conditions.push(`slot.start_at >= $${params.length}`);
    }

    if (filters.to) {
      params.push(filters.to);
      conditions.push(`slot.start_at <= $${params.length}`);
    }

    return {
      sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  // 建立 booking 查詢條件，completed 依查詢時計算規則篩選。
  private buildBookingWhere(filters: { status?: AdminBookingStatus; serviceId?: string; userId?: string; from?: Date; to?: Date }): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status === 'completed') {
      conditions.push("b.status <> 'cancelled' AND slot.end_at < now()");
    } else if (filters.status === 'confirmed') {
      conditions.push("b.status = 'confirmed' AND slot.end_at >= now()");
    } else if (filters.status === 'cancelled') {
      conditions.push("b.status = 'cancelled'");
    }

    if (filters.serviceId) {
      params.push(filters.serviceId);
      conditions.push(`b.service_id = $${params.length}`);
    }

    if (filters.userId) {
      params.push(filters.userId);
      conditions.push(`b.user_id = $${params.length}`);
    }

    if (filters.from) {
      params.push(filters.from);
      conditions.push(`slot.start_at >= $${params.length}`);
    }

    if (filters.to) {
      params.push(filters.to);
      conditions.push(`slot.start_at <= $${params.length}`);
    }

    return {
      sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  // 產生 booking 對外狀態 SQL，completed 不寫入 DB。
  private externalBookingStatusSql(): string {
    return "CASE WHEN b.status <> 'cancelled' AND slot.end_at < now() THEN 'completed' ELSE b.status::text END";
  }

  // 正規化 QueryRunner 回傳格式，避免 TypeORM query 型態差異影響 RETURNING。
  private firstQueryRunnerRow<T>(rows: T[] | [T[], number]): T {
    if (Array.isArray(rows[0])) {
      return rows[0][0];
    }

    return rows[0] as T;
  }
}
