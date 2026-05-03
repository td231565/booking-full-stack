import { Controller, Get } from '@nestjs/common';
import { noContentResponse } from '../../common/api-response';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  // 注入 AuthService，後續註冊、登入、登出與 me API 會集中委派到 service。
  constructor(private readonly authService: AuthService) {}

  // 暫時提供 module 健康檢查，確認 controller/service/repository 分層已接上。
  @Get('module-status')
  getModuleStatus() {
    this.authService.ensureModuleReady();

    return noContentResponse();
  }
}
