import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { listResponse } from '../../common/api-response';
import { ApiException } from '../../common/api-exception';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs')
export class AuditLogController {
  // 注入 AuditLogService 與 AuthService，稽核紀錄查詢同樣需要後端 Admin role 檢查。
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly authService: AuthService,
  ) {}

  // 查詢 audit log 列表；查詢類 Admin API 暫不寫入 audit log。
  @Get()
  async getAuditLogs(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.requireAdmin(request);
    const result = await this.auditLogService.getAuditLogs(this.parsePositiveInt(page, 1), this.parsePositiveInt(pageSize, 20), {
      actorUserId,
      targetType,
      targetId,
      action,
      from,
      to,
    });

    return listResponse(result.items, result.meta);
  }

  // 從 session 取得目前使用者並檢查 role=admin。
  private async requireAdmin(request: Request): Promise<void> {
    const user = await this.authService.getCurrentUser(this.readSessionToken(request));

    if (user.role !== 'admin') {
      throw new ApiException(403, 'FORBIDDEN', '權限不足');
    }
  }

  // 從 Cookie header 解析 session token，避免稽核查詢只靠前端判斷權限。
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

  // 將分頁 query 轉成正整數，無效值交由 service 套用保守預設值。
  private parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
