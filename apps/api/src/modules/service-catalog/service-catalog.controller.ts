import { Controller, Get, Param, Query } from '@nestjs/common';
import { listResponse, successResponse } from '../../common/api-response';
import { ServiceCatalogService } from './service-catalog.service';

@Controller('services')
export class ServiceCatalogController {
  // 注入 ServiceCatalogService，後續公開服務列表與詳情 API 會集中委派到 service。
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  // 回傳公開服務列表，訪客可查看 active 與 inactive 服務但不會看到 hidden 服務。
  @Get()
  async getPublicServices(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const result = await this.serviceCatalogService.getPublicServices(this.parsePositiveInt(page, 1), this.parsePositiveInt(pageSize, 20));

    return listResponse(result.items, result.meta);
  }

  // 回傳公開服務詳情，hidden 服務會由 service 層轉成 SERVICE_NOT_FOUND。
  @Get(':serviceId')
  async getPublicService(@Param('serviceId') serviceId: string) {
    const service = await this.serviceCatalogService.getPublicService(serviceId);

    return successResponse(service);
  }

  // 回傳公開可預約時段，供服務詳情頁呈現可選時間。
  @Get(':serviceId/availability')
  async getPublicAvailability(
    @Param('serviceId') serviceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const slots = await this.serviceCatalogService.getPublicAvailability(serviceId, from, to);

    return successResponse(slots);
  }

  // 將分頁 query 轉成正整數，無效值交由 service 套用保守預設值。
  private parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
