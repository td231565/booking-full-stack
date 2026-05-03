import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from './audit-log.repository';

@Injectable()
export class AuditLogService {
  // 注入 AuditLogRepository，保留 audit_logs 寫入與查詢的資料存取邊界。
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  // 驗證 audit log module 空殼已可由 controller 呼叫到 repository。
  ensureModuleReady(): void {
    this.auditLogRepository.ensureReady();
  }
}
