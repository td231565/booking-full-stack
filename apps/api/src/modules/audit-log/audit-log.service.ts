import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import { AuditLogRecord, AuditLogRepository } from './audit-log.repository';

type AuditLogPage = {
  items: AuditLogRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class AuditLogService {
  // 注入 AuditLogRepository，保留 audit_logs 寫入與查詢的資料存取邊界。
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  // 查詢 audit_logs；查詢本身不寫入 audit log，避免讀取行為污染稽核紀錄。
  async getAuditLogs(
    page: number,
    pageSize: number,
    filters: { actorUserId?: string; targetType?: string; targetId?: string; action?: string; from?: string; to?: string },
  ): Promise<AuditLogPage> {
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.min(Math.max(1, pageSize), 100);
    const result = await this.auditLogRepository.findAuditLogs(normalizedPage, normalizedPageSize, {
      actorUserId: filters.actorUserId,
      targetType: filters.targetType,
      targetId: filters.targetId,
      action: filters.action,
      from: this.parseOptionalDate(filters.from),
      to: this.parseOptionalDate(filters.to),
    });

    return {
      items: result.items,
      meta: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / normalizedPageSize)),
      },
    };
  }

  // 解析 optional ISO 日期，無效日期回穩定驗證錯誤。
  private parseOptionalDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new ApiException(400, 'VALIDATION_ERROR', '輸入資料驗證失敗');
    }

    return date;
  }
}
