import { Injectable } from '@nestjs/common';
import { BookingRepository } from './booking.repository';

@Injectable()
export class BookingService {
  // 注入 BookingRepository，保留預約交易與資料一致性規則的資料存取邊界。
  constructor(private readonly bookingRepository: BookingRepository) {}

  // 驗證 booking module 空殼已可由 controller 呼叫到 repository。
  ensureModuleReady(): void {
    this.bookingRepository.ensureReady();
  }
}
