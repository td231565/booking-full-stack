import { Injectable } from '@nestjs/common';
import { AdminRepository } from './admin.repository';

@Injectable()
export class AdminService {
  // 注入 AdminRepository，保留後台跨資源管理資料存取邊界。
  constructor(private readonly adminRepository: AdminRepository) {}

  // 驗證 admin module 空殼已可由 controller 呼叫到 repository。
  ensureModuleReady(): void {
    this.adminRepository.ensureReady();
  }
}
