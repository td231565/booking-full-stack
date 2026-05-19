import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { noContentResponse, successResponse } from '../../common/api-response';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  // 注入 AuthService，後續註冊、登入、登出與 me API 會集中委派到 service。
  constructor(private readonly authService: AuthService) {}

  // 建立一般會員帳號，回應不包含 passwordHash。
  @Post('register')
  async register(@Body() body: RegisterDto) {
    const user = await this.authService.register(body.email, body.password, body.displayName);

    return successResponse(user);
  }

  // 登入成功後建立 server-side session，並以 HttpOnly Cookie 保存明文 token。
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(body.email, body.password);

    response.cookie(this.authService.getSessionCookieName(), result.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      expires: result.expiresAt,
      path: '/',
    });

    return successResponse(result.user);
  }

  // 登出時撤銷目前 session 並清除 cookie。
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(this.readSessionToken(request));
    response.clearCookie(this.authService.getSessionCookieName(), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    return noContentResponse();
  }

  // 依 HttpOnly Cookie 對應的 server-side session 回傳目前登入者。
  @Get('me')
  async getCurrentUser(@Req() request: Request) {
    const user = await this.authService.getCurrentUser(this.readSessionToken(request));

    return successResponse(user);
  }

  // 從 Cookie header 解析 session token，避免前端接觸 HttpOnly cookie。
  private readSessionToken(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return undefined;
    }

    const cookie = cookieHeader
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${this.authService.getSessionCookieName()}=`));

    return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : undefined;
  }
}
