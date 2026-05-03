import { Controller, Get } from '@nestjs/common';
import { noContentResponse } from '../../common/api-response';
import { BookingService } from './booking.service';

@Controller('bookings/module-status')
export class BookingController {
  // 注入 BookingService，後續建立與取消預約的交易規則會集中在 service。
  constructor(private readonly bookingService: BookingService) {}

  // 暫時提供 module 健康檢查，確認 booking 分層已建立。
  @Get()
  getModuleStatus() {
    this.bookingService.ensureModuleReady();

    return noContentResponse();
  }
}
