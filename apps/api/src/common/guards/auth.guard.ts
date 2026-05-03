import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiException } from '../api-exception';

@Injectable()
export class AuthGuard implements CanActivate {
  // 保留認證掛載位置，Phase 4 會改為檢查 server-side session 與 HttpOnly Cookie。
  canActivate(_context: ExecutionContext): boolean {
    throw new ApiException(401, 'UNAUTHENTICATED', '尚未登入');
  }
}
