import { Injectable } from '@nestjs/common';
import { AvailabilityRepository } from './availability.repository';

@Injectable()
export class AvailabilityService {
  // 注入 AvailabilityRepository，保留 availability_slots 查詢與狀態規則邊界。
  constructor(private readonly availabilityRepository: AvailabilityRepository) {}

  // 驗證 availability module 空殼已可由 controller 呼叫到 repository。
  ensureModuleReady(): void {
    this.availabilityRepository.ensureReady();
  }
}
