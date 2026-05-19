import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type AuditLogRecord = {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

@Injectable()
export class AuditLogRepository {
  // 注入 DataSource，封裝 audit_logs 查詢操作。
  constructor(private readonly dataSource: DataSource) {}

  // 查詢稽核紀錄列表，支援操作者、操作對象與建立時間區間篩選。
  async findAuditLogs(
    page: number,
    pageSize: number,
    filters: { actorUserId?: string; targetType?: string; targetId?: string; action?: string; from?: Date; to?: Date },
  ): Promise<{ items: AuditLogRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const where = this.buildWhere(filters);
    const rows = await this.dataSource.query<AuditLogRecord[]>(
      `
        SELECT
          id,
          actor_user_id AS "actorUserId",
          action,
          target_type AS "targetType",
          target_id AS "targetId",
          metadata,
          ip_address::text AS "ipAddress",
          user_agent AS "userAgent",
          created_at AS "createdAt"
        FROM audit_logs
        ${where.sql}
        ORDER BY created_at DESC, id DESC
        LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}
      `,
      [...where.params, pageSize, offset],
    );
    const [{ total }] = await this.dataSource.query<Array<{ total: string }>>(
      `
        SELECT COUNT(*)::text AS total
        FROM audit_logs
        ${where.sql}
      `,
      where.params,
    );

    return {
      items: rows,
      total: Number(total),
    };
  }

  // 建立 audit_logs 查詢條件，所有條件都透過 positional parameters 帶入。
  private buildWhere(filters: { actorUserId?: string; targetType?: string; targetId?: string; action?: string; from?: Date; to?: Date }): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.actorUserId) {
      params.push(filters.actorUserId);
      conditions.push(`actor_user_id = $${params.length}`);
    }

    if (filters.targetType) {
      params.push(filters.targetType);
      conditions.push(`target_type = $${params.length}`);
    }

    if (filters.targetId) {
      params.push(filters.targetId);
      conditions.push(`target_id = $${params.length}`);
    }

    if (filters.action) {
      params.push(filters.action);
      conditions.push(`action = $${params.length}`);
    }

    if (filters.from) {
      params.push(filters.from);
      conditions.push(`created_at >= $${params.length}`);
    }

    if (filters.to) {
      params.push(filters.to);
      conditions.push(`created_at <= $${params.length}`);
    }

    return {
      sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }
}
