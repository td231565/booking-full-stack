import { Injectable } from '@nestjs/common';

@Injectable()
export class AvailabilityRepository {
  // 保留時段資料存取位置，Phase 3 與 Phase 5 會在這裡封裝 availability_slots 查詢。
  ensureReady(): void {
    return;
  }
}
