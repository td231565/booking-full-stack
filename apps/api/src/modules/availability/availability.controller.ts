import { Controller, Get } from '@nestjs/common';
import { noContentResponse } from '../../common/api-response';
import { AvailabilityService } from './availability.service';

@Controller('availability/module-status')
export class AvailabilityController {
  // 注入 AvailabilityService，後續服務可預約時段 API 會集中委派到 service。
  constructor(private readonly availabilityService: AvailabilityService) {}

  // 暫時提供 module 健康檢查，確認 availability 分層已建立。
  @Get()
  getModuleStatus() {
    this.availabilityService.ensureModuleReady();

    return noContentResponse();
  }
}
