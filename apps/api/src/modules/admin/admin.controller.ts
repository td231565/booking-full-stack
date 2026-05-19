import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { listResponse, successResponse } from '../../common/api-response';
import { ApiException } from '../../common/api-exception';
import { AuthService } from '../auth/auth.service';
import {
  BulkGenerateAvailabilitySlotsDto,
  CancelAdminBookingDto,
  CreateAdminAvailabilitySlotDto,
  CreateAdminBookingDto,
  CreateAdminServiceDto,
  UpdateAdminAvailabilitySlotDto,
  UpdateAdminBookingDto,
  UpdateAdminServiceDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  // 注入 AdminService 與 AuthService，所有 Admin API 都由後端 session role 檢查。
  constructor(
    private readonly adminService: AdminService,
    private readonly authService: AuthService,
  ) {}

  // 查詢後台服務列表，包含 hidden 服務。
  @Get('services')
  async getServices(@Req() request: Request, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    await this.requireAdmin(request);
    const result = await this.adminService.getServices(this.parsePositiveInt(page, 1), this.parsePositiveInt(pageSize, 20), status);

    return listResponse(result.items, result.meta);
  }

  // 查詢後台服務詳情，Admin 可取得 hidden 服務。
  @Get('services/:serviceId')
  async getService(@Req() request: Request, @Param('serviceId') serviceId: string) {
    await this.requireAdmin(request);
    const service = await this.adminService.getService(serviceId);

    return successResponse(service);
  }

  // Admin 建立服務，成功後寫入 audit log。
  @Post('services')
  async createService(@Req() request: Request, @Body() body: CreateAdminServiceDto) {
    const admin = await this.requireAdmin(request);
    const service = await this.adminService.createService(body, this.toAuditContext(request, admin.id));

    return successResponse(service);
  }

  // Admin 更新服務，成功後寫入 audit log。
  @Patch('services/:serviceId')
  async updateService(@Req() request: Request, @Param('serviceId') serviceId: string, @Body() body: UpdateAdminServiceDto) {
    const admin = await this.requireAdmin(request);
    const service = await this.adminService.updateService(serviceId, body, this.toAuditContext(request, admin.id));

    return successResponse(service);
  }

  // 查詢後台時段列表。
  @Get('availability-slots')
  async getAvailabilitySlots(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('serviceId') serviceId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.requireAdmin(request);
    const result = await this.adminService.getAvailabilitySlots(this.parsePositiveInt(page, 1), this.parsePositiveInt(pageSize, 20), {
      serviceId,
      status,
      from,
      to,
    });

    return listResponse(result.items, result.meta);
  }

  // 查詢後台時段詳情。
  @Get('availability-slots/:slotId')
  async getAvailabilitySlot(@Req() request: Request, @Param('slotId') slotId: string) {
    await this.requireAdmin(request);
    const slot = await this.adminService.getAvailabilitySlot(slotId);

    return successResponse(slot);
  }

  // Admin 建立單筆可預約時段。
  @Post('availability-slots')
  async createAvailabilitySlot(@Req() request: Request, @Body() body: CreateAdminAvailabilitySlotDto) {
    const admin = await this.requireAdmin(request);
    const slot = await this.adminService.createAvailabilitySlot(body, this.toAuditContext(request, admin.id));

    return successResponse(slot);
  }

  // Admin 更新單筆可預約時段。
  @Patch('availability-slots/:slotId')
  async updateAvailabilitySlot(@Req() request: Request, @Param('slotId') slotId: string, @Body() body: UpdateAdminAvailabilitySlotDto) {
    const admin = await this.requireAdmin(request);
    const slot = await this.adminService.updateAvailabilitySlot(slotId, body, this.toAuditContext(request, admin.id));

    return successResponse(slot);
  }

  // Admin 批次產生 Asia/Taipei 時段，已存在時段會跳過。
  @Post('availability-slots/bulk-generate')
  @HttpCode(200)
  async bulkGenerateAvailabilitySlots(@Req() request: Request, @Body() body: BulkGenerateAvailabilitySlotsDto) {
    const admin = await this.requireAdmin(request);
    const result = await this.adminService.bulkGenerateAvailabilitySlots(body, this.toAuditContext(request, admin.id));

    return successResponse(result);
  }

  // 查詢所有會員預約。
  @Get('bookings')
  async getBookings(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('serviceId') serviceId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.requireAdmin(request);
    const result = await this.adminService.getBookings(this.parsePositiveInt(page, 1), this.parsePositiveInt(pageSize, 20), {
      status,
      serviceId,
      userId,
      from,
      to,
    });

    return listResponse(result.items, result.meta);
  }

  // Admin 替會員建立預約。
  @Post('bookings')
  async createBooking(@Req() request: Request, @Body() body: CreateAdminBookingDto) {
    const admin = await this.requireAdmin(request);
    const booking = await this.adminService.createBooking(body.userId, body.availabilitySlotId, body.note, this.toAuditContext(request, admin.id));

    return successResponse(booking);
  }

  // Admin 更新預約備註；MVP 不提供手動狀態更新。
  @Patch('bookings/:bookingId')
  async updateBooking(@Req() request: Request, @Param('bookingId') bookingId: string, @Body() body: UpdateAdminBookingDto) {
    const admin = await this.requireAdmin(request);
    const booking = await this.adminService.updateBooking(bookingId, body.note, this.toAuditContext(request, admin.id));

    return successResponse(booking);
  }

  // Admin 取消任意會員 confirmed 預約。
  @Post('bookings/:bookingId/cancel')
  @HttpCode(200)
  async cancelBooking(@Req() request: Request, @Param('bookingId') bookingId: string, @Body() body: CancelAdminBookingDto) {
    const admin = await this.requireAdmin(request);
    const booking = await this.adminService.cancelBooking(bookingId, body.reason, this.toAuditContext(request, admin.id));

    return successResponse(booking);
  }

  // 從 session 取得目前使用者並檢查 role=admin，避免只依賴前端 route guard。
  private async requireAdmin(request: Request): Promise<{ id: string }> {
    const user = await this.authService.getCurrentUser(this.readSessionToken(request));

    if (user.role !== 'admin') {
      throw new ApiException(403, 'FORBIDDEN', '權限不足');
    }

    return {
      id: user.id,
    };
  }

  // 從 Cookie header 解析 session token，讓 Admin API 的權限檢查完全在後端完成。
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

  // 將 request 中的稽核資訊收斂成 service 需要的格式。
  private toAuditContext(request: Request, actorUserId: string): { actorUserId: string; ipAddress: string | null; userAgent: string | null } {
    return {
      actorUserId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    };
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
