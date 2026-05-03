import { Controller, Get } from '@nestjs/common';
import { noContentResponse } from '../../common/api-response';
import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs/module-status')
export class AuditLogController {
  // 注入 AuditLogService，後續後台重要操作會透過 service 寫入 audit_logs。
  constructor(private readonly auditLogService: AuditLogService) {}

  // 暫時提供 module 健康檢查，確認 audit log 分層已建立。
  @Get()
  getModuleStatus() {
    this.auditLogService.ensureModuleReady();

    return noContentResponse();
  }
}
