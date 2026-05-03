import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthRepository {
  // 保留 Auth 資料存取位置，Phase 4 會在這裡封裝 users 與 sessions 查詢。
  ensureReady(): void {
    return;
  }
}
