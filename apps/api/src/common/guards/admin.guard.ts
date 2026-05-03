import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiException } from '../api-exception';

@Injectable()
export class AdminGuard implements CanActivate {
  // 保留管理員授權掛載位置，Phase 5 會改為檢查目前使用者 role 是否為 admin。
  canActivate(_context: ExecutionContext): boolean {
    throw new ApiException(403, 'FORBIDDEN', '權限不足');
  }
}
