import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';

export type CreatedBookingRecord = {
  id: string;
  userId: string;
  serviceId: string;
  availabilitySlotId: string;
  status: 'confirmed';
  note: string | null;
  createdAt: Date;
};

export type BookingListRecord = {
  id: string;
  status: BookingStatus;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };
  slot: {
    id: string;
    startAt: Date;
    endAt: Date;
  };
  createdAt: Date;
};

export type BookingDetailRecord = BookingListRecord & {
  note: string | null;
  cancelledAt: Date | null;
  cancelledBy: 'user' | 'admin' | null;
  cancelReason: string | null;
  updatedAt: Date;
};

export type CancelledBookingRecord = {
  id: string;
  status: 'cancelled';
  cancelledBy: 'user';
  cancelReason: string | null;
  cancelledAt: Date;
};

type SlotForBooking = {
  id: string;
  serviceId: string;
  serviceStatus: 'active' | 'inactive' | 'hidden';
  slotStatus: 'available' | 'blocked' | 'inactive';
  startAt: Date;
};

type BookingForCancel = {
  id: string;
  status: 'confirmed' | 'cancelled';
  startAt: Date;
  endAt: Date;
};

@Injectable()
export class BookingRepository {
  // 注入 DataSource 以在 service 層交易中執行 booking 與 log 操作。
  constructor(private readonly dataSource: DataSource) {}

  // 建立 QueryRunner，讓 service 可以用單一 transaction 保護預約一致性。
  createQueryRunner(): QueryRunner {
    return this.dataSource.createQueryRunner();
  }

  // 鎖定指定時段，避免同時搶同一 slot 時讀到不一致狀態。
  async findSlotForBooking(queryRunner: QueryRunner, availabilitySlotId: string): Promise<SlotForBooking | null> {
    const rows = (await queryRunner.query(
      `
        SELECT
          s.id,
          s.service_id AS "serviceId",
          service.status AS "serviceStatus",
          s.status AS "slotStatus",
          s.start_at AS "startAt"
        FROM availability_slots s
        INNER JOIN services service ON service.id = s.service_id
        WHERE s.id = $1
        FOR UPDATE OF s
      `,
      [availabilitySlotId],
    )) as SlotForBooking[];

    return rows[0] ?? null;
  }

  // 檢查同一使用者是否已有該時段有效預約，用來回傳較精準的 BOOKING_DUPLICATED。
  async hasActiveBookingForUserSlot(queryRunner: QueryRunner, userId: string, availabilitySlotId: string): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM bookings
          WHERE user_id = $1
            AND availability_slot_id = $2
            AND status <> 'cancelled'
        ) AS "exists"
      `,
      [userId, availabilitySlotId],
    )) as Array<{ exists: boolean }>;

    return rows[0]?.exists ?? false;
  }

  // 檢查時段是否已有其他有效預約，避免同一 slot 被重複預約。
  async hasActiveBookingForSlot(queryRunner: QueryRunner, availabilitySlotId: string): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM bookings
          WHERE availability_slot_id = $1
            AND status <> 'cancelled'
        ) AS "exists"
      `,
      [availabilitySlotId],
    )) as Array<{ exists: boolean }>;

    return rows[0]?.exists ?? false;
  }

  // 建立 confirmed booking，userId 一律來自目前 session。
  async insertBooking(
    queryRunner: QueryRunner,
    userId: string,
    serviceId: string,
    availabilitySlotId: string,
    note: string | null,
  ): Promise<CreatedBookingRecord> {
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
      [userId, serviceId, availabilitySlotId, note],
    )) as CreatedBookingRecord[];

    return this.firstQueryRunnerRow(rows);
  }

  // 寫入 booking 狀態轉換紀錄，保留建立與取消預約的稽核脈絡。
  async insertStatusLog(
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

  // 查詢目前會員自己的預約列表，對外狀態 completed 由查詢時計算。
  async findMyBookings(
    userId: string,
    page: number,
    pageSize: number,
    status: BookingStatus | undefined,
  ): Promise<{ items: BookingListRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const statusFilter = this.toStatusFilter(status);
    const rows = await this.dataSource.query<BookingListRecord[]>(
      `
        SELECT
          b.id,
          ${this.externalStatusSql()} AS status,
          json_build_object(
            'id', service.id,
            'name', service.name,
            'durationMinutes', service.duration_minutes,
            'price', service.price
          ) AS service,
          json_build_object(
            'id', slot.id,
            'startAt', slot.start_at,
            'endAt', slot.end_at
          ) AS slot,
          b.created_at AS "createdAt"
        FROM bookings b
        INNER JOIN services service ON service.id = b.service_id
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        WHERE b.user_id = $1
          ${statusFilter.whereSql}
        ORDER BY slot.start_at DESC, b.created_at DESC
        LIMIT $2 OFFSET $3
      `,
      [userId, pageSize, offset, ...statusFilter.params],
    );
    const [{ total }] = await this.dataSource.query<Array<{ total: string }>>(
      `
        SELECT COUNT(*)::text AS total
        FROM bookings b
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        WHERE b.user_id = $1
          ${statusFilter.whereSql}
      `,
      [userId, ...statusFilter.params],
    );

    return {
      items: rows,
      total: Number(total),
    };
  }

  // 查詢目前會員自己的預約詳情，不屬於自己的預約直接視為不存在。
  async findMyBookingById(userId: string, bookingId: string): Promise<BookingDetailRecord | null> {
    const rows = await this.dataSource.query<BookingDetailRecord[]>(
      `
        SELECT
          b.id,
          ${this.externalStatusSql()} AS status,
          b.note,
          b.cancelled_at AS "cancelledAt",
          b.cancelled_by AS "cancelledBy",
          b.cancel_reason AS "cancelReason",
          json_build_object(
            'id', service.id,
            'name', service.name,
            'durationMinutes', service.duration_minutes,
            'price', service.price
          ) AS service,
          json_build_object(
            'id', slot.id,
            'startAt', slot.start_at,
            'endAt', slot.end_at
          ) AS slot,
          b.created_at AS "createdAt",
          b.updated_at AS "updatedAt"
        FROM bookings b
        INNER JOIN services service ON service.id = b.service_id
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        WHERE b.user_id = $1 AND b.id = $2
        LIMIT 1
      `,
      [userId, bookingId],
    );

    return rows[0] ?? null;
  }

  // 鎖定會員自己的 booking，取消流程需同時判斷狀態與 slot 開始時間。
  async findMyBookingForCancel(queryRunner: QueryRunner, userId: string, bookingId: string): Promise<BookingForCancel | null> {
    const rows = (await queryRunner.query(
      `
        SELECT
          b.id,
          b.status,
          slot.start_at AS "startAt",
          slot.end_at AS "endAt"
        FROM bookings b
        INNER JOIN availability_slots slot ON slot.id = b.availability_slot_id
        WHERE b.user_id = $1 AND b.id = $2
        FOR UPDATE OF b
      `,
      [userId, bookingId],
    )) as BookingForCancel[];

    return rows[0] ?? null;
  }

  // 將自己的預約更新為 cancelled 並寫入取消來源與原因。
  async cancelMyBooking(queryRunner: QueryRunner, bookingId: string, reason: string | null): Promise<CancelledBookingRecord> {
    const rows = (await queryRunner.query(
      `
        UPDATE bookings
        SET
          status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = 'user',
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
    )) as CancelledBookingRecord[];

    return this.firstQueryRunnerRow(rows);
  }

  // 產生對外 booking 狀態 SQL，completed 不落 DB 而是查詢時計算。
  private externalStatusSql(): string {
    return "CASE WHEN b.status <> 'cancelled' AND slot.end_at < now() THEN 'completed' ELSE b.status::text END";
  }

  // 依 status query 產生篩選條件，讓 completed 可使用同一套查詢時計算規則。
  private toStatusFilter(status: BookingStatus | undefined): { whereSql: string; params: unknown[] } {
    if (!status) {
      return {
        whereSql: '',
        params: [],
      };
    }

    if (status === 'completed') {
      return {
        whereSql: "AND b.status <> 'cancelled' AND slot.end_at < now()",
        params: [],
      };
    }

    if (status === 'confirmed') {
      return {
        whereSql: "AND b.status = 'confirmed' AND slot.end_at >= now()",
        params: [],
      };
    }

    return {
      whereSql: "AND b.status = 'cancelled'",
      params: [],
    };
  }

  // 正規化 QueryRunner 在不同 SQL 類型下的回傳，確保 RETURNING 取到第一筆資料列。
  private firstQueryRunnerRow<T>(rows: T[] | [T[], number]): T {
    if (Array.isArray(rows[0])) {
      return rows[0][0];
    }

    return rows[0] as T;
  }
}
