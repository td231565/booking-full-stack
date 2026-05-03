import { Injectable } from '@nestjs/common';

@Injectable()
export class BookingRepository {
  // 保留預約資料存取位置，Phase 4 會在這裡封裝 bookings 與 booking_status_logs 操作。
  ensureReady(): void {
    return;
  }
}
