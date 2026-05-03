import { Injectable } from '@nestjs/common';
import { AuthRepository } from './auth.repository';

@Injectable()
export class AuthService {
  // 注入 AuthRepository，保留 session 與 user credential 資料存取邊界。
  constructor(private readonly authRepository: AuthRepository) {}

  // 驗證 Auth module 空殼已可由 controller 呼叫到 repository。
  ensureModuleReady(): void {
    this.authRepository.ensureReady();
  }
}
