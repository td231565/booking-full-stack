import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { readSessionTokenFromRequest } from '../../common/auth/session-cookie';
import { noContentResponse, successResponse } from '../../common/api-response';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('admin/auth')
export class AdminAuthController {
  // 注入 AuthService，後台登入／登出／me 委派至同一 service，但使用 admin cookie。
  constructor(private readonly authService: AuthService) {}

  // 後台登入成功後建立 admin session，並以獨立 HttpOnly Cookie 保存 token。
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.loginAsAdmin(body.email, body.password);

    response.cookie(this.authService.getSessionCookieName('admin'), result.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires: result.expiresAt,
      path: '/',
    });

    return successResponse(result.user);
  }

  // 後台登出僅撤銷 admin session 並清除 admin cookie。
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const sessionToken = this.readAdminSessionToken(request);
    await this.authService.logout(sessionToken, 'admin');
    response.clearCookie(this.authService.getSessionCookieName('admin'), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    return noContentResponse();
  }

  // 依 admin cookie 回傳目前後台登入者。
  @Get('me')
  async getCurrentUser(@Req() request: Request) {
    const user = await this.authService.getCurrentUser(this.readAdminSessionToken(request), 'admin');

    return successResponse(user);
  }

  // 後台 Auth 僅讀 booking_admin_session，忽略 member cookie 以防混用。
  private readAdminSessionToken(request: Request): string | undefined {
    return readSessionTokenFromRequest(request, this.authService.getSessionCookieName('admin'));
  }
}
