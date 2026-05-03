import { Controller, Get } from '@nestjs/common';
import { noContentResponse } from '../../common/api-response';
import { ServiceCatalogService } from './service-catalog.service';

@Controller('services/module-status')
export class ServiceCatalogController {
  // 注入 ServiceCatalogService，後續公開服務列表與詳情 API 會集中委派到 service。
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  // 暫時提供 module 健康檢查，確認公開服務 module 分層已建立。
  @Get()
  getModuleStatus() {
    this.serviceCatalogService.ensureModuleReady();

    return noContentResponse();
  }
}
