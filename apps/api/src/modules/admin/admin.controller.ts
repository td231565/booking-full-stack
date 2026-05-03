import { Controller, Get } from '@nestjs/common';
import { noContentResponse } from '../../common/api-response';
import { AdminService } from './admin.service';

@Controller('admin/module-status')
export class AdminController {
  // 注入 AdminService，後續後台服務、時段與預約管理 API 會集中委派到 service。
  constructor(private readonly adminService: AdminService) {}

  // 暫時提供 module 健康檢查，確認 admin 分層已建立。
  @Get()
  getModuleStatus() {
    this.adminService.ensureModuleReady();

    return noContentResponse();
  }
}
