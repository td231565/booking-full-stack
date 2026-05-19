import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import {
  PublicAvailabilitySlotRecord,
  PublicServiceRecord,
  ServiceCatalogRepository,
} from './service-catalog.repository';

export type PublicServicesPage = {
  items: PublicServiceRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class ServiceCatalogService {
  // 注入 ServiceCatalogRepository，保留 services 查詢規則的資料存取邊界。
  constructor(private readonly serviceCatalogRepository: ServiceCatalogRepository) {}

  // 取得公開服務列表，統一限制分頁範圍以避免過大的查詢。
  async getPublicServices(page: number, pageSize: number): Promise<PublicServicesPage> {
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.min(Math.max(1, pageSize), 100);
    const { items, total } = await this.serviceCatalogRepository.findPublicServices(normalizedPage, normalizedPageSize);

    return {
      items,
      meta: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
      },
    };
  }

  // 取得公開服務詳情；hidden 或不存在都回傳 SERVICE_NOT_FOUND。
  async getPublicService(serviceId: string): Promise<PublicServiceRecord> {
    const service = await this.serviceCatalogRepository.findPublicServiceById(serviceId);

    if (!service) {
      throw new ApiException(404, 'SERVICE_NOT_FOUND', '服務不存在');
    }

    return service;
  }

  // 取得公開可預約時段，並套用 active 服務、available 時段與至少 1 小時後的規則。
  async getPublicAvailability(
    serviceId: string,
    fromValue: string | undefined,
    toValue: string | undefined,
  ): Promise<PublicAvailabilitySlotRecord[]> {
    await this.getPublicService(serviceId);

    const now = new Date();
    const from = this.parseDateOrDefault(fromValue, now);
    const to = this.parseDateOrDefault(toValue, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));

    if (to.getTime() < from.getTime()) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }

    return this.serviceCatalogRepository.findAvailableSlots(serviceId, from, to);
  }

  // 將未提供的查詢時間套用預設值，格式錯誤時回傳穩定錯誤碼。
  private parseDateOrDefault(value: string | undefined, fallback: Date): Date {
    if (!value) {
      return fallback;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }

    return parsed;
  }
}
