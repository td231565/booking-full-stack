import { Injectable } from '@nestjs/common';
import { ServiceCatalogRepository } from './service-catalog.repository';

@Injectable()
export class ServiceCatalogService {
  // 注入 ServiceCatalogRepository，保留 services 查詢規則的資料存取邊界。
  constructor(private readonly serviceCatalogRepository: ServiceCatalogRepository) {}

  // 驗證公開服務 module 空殼已可由 controller 呼叫到 repository。
  ensureModuleReady(): void {
    this.serviceCatalogRepository.ensureReady();
  }
}
