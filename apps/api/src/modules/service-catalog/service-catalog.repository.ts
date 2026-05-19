import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type PublicServiceStatus = 'active' | 'inactive';

export type PublicServiceRecord = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  durationMinutes: number;
  price: number;
  status: PublicServiceStatus;
};

export type PublicAvailabilitySlotRecord = {
  id: string;
  serviceId: string;
  startAt: Date;
  endAt: Date;
  status: 'available';
};

@Injectable()
export class ServiceCatalogRepository {
  // 注入 DataSource 以使用原生 SQL 查詢目前尚未建立 TypeORM entity 的公開服務資料表。
  constructor(private readonly dataSource: DataSource) {}

  // 查詢公開服務列表，排除 hidden 服務並回傳分頁總數。
  async findPublicServices(page: number, pageSize: number): Promise<{ items: PublicServiceRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const rows = await this.dataSource.query<PublicServiceRecord[]>(
      `
        SELECT
          id,
          name,
          description,
          image_url AS "imageUrl",
          duration_minutes AS "durationMinutes",
          price,
          status
        FROM services
        WHERE status IN ('active', 'inactive')
        ORDER BY created_at ASC, id ASC
        LIMIT $1 OFFSET $2
      `,
      [pageSize, offset],
    );
    const [{ total }] = await this.dataSource.query<Array<{ total: string }>>(
      "SELECT COUNT(*)::text AS total FROM services WHERE status IN ('active', 'inactive')",
    );

    return {
      items: rows,
      total: Number(total),
    };
  }

  // 查詢公開服務詳情，hidden 服務視為不存在以符合公開 API 規則。
  async findPublicServiceById(serviceId: string): Promise<PublicServiceRecord | null> {
    const rows = await this.dataSource.query<PublicServiceRecord[]>(
      `
        SELECT
          id,
          name,
          description,
          image_url AS "imageUrl",
          duration_minutes AS "durationMinutes",
          price,
          status
        FROM services
        WHERE id = $1 AND status IN ('active', 'inactive')
        LIMIT 1
      `,
      [serviceId],
    );

    return rows[0] ?? null;
  }

  // 查詢可預約時段；若 Phase 4 已建立 bookings 表，會同步排除非 cancelled 預約。
  async findAvailableSlots(serviceId: string, from: Date, to: Date): Promise<PublicAvailabilitySlotRecord[]> {
    const hasBookingsTable = await this.hasTable('bookings');
    const bookingFilter = hasBookingsTable
      ? `
        AND NOT EXISTS (
          SELECT 1
          FROM bookings b
          WHERE b.availability_slot_id = s.id
            AND b.status <> 'cancelled'
        )
      `
      : '';

    return this.dataSource.query<PublicAvailabilitySlotRecord[]>(
      `
        SELECT
          s.id,
          s.service_id AS "serviceId",
          s.start_at AS "startAt",
          s.end_at AS "endAt",
          s.status
        FROM availability_slots s
        INNER JOIN services service ON service.id = s.service_id
        WHERE s.service_id = $1
          AND service.status = 'active'
          AND s.status = 'available'
          AND s.start_at >= $2
          AND s.start_at >= $3
          AND s.start_at <= $4
          ${bookingFilter}
        ORDER BY s.start_at ASC, s.id ASC
      `,
      [serviceId, new Date(Date.now() + 60 * 60 * 1000), from, to],
    );
  }

  // 檢查資料表是否存在，讓 Phase 3 可先運作並在 Phase 4 自動套用 booking 排除規則。
  private async hasTable(tableName: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) AS "exists"
      `,
      [tableName],
    );

    return rows[0]?.exists ?? false;
  }
}
