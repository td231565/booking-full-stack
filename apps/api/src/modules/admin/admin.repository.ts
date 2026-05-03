import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminRepository {
  // 保留後台資料存取位置，Phase 5 會在這裡封裝 admin 查詢與異動。
  ensureReady(): void {
    return;
  }
}
