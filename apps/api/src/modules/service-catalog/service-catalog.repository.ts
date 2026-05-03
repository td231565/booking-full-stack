import { Injectable } from '@nestjs/common';

@Injectable()
export class ServiceCatalogRepository {
  // 保留公開服務資料存取位置，Phase 3 會在這裡封裝 hidden/inactive 查詢規則。
  ensureReady(): void {
    return;
  }
}
