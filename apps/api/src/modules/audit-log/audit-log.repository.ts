import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditLogRepository {
  // 保留稽核紀錄資料存取位置，Phase 5 會在這裡封裝 audit_logs 寫入與查詢。
  ensureReady(): void {
    return;
  }
}
