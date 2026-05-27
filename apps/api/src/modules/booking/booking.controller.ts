import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { readSessionTokenFromRequest } from '../../common/auth/session-cookie';
import { listResponse, successResponse } from '../../common/api-response';
import { AuthService } from '../auth/auth.service';
import { CancelBookingDto, CreateBookingDto } from './booking.dto';
import { BookingService } from './booking.service';

@Controller()
export class BookingController {
  // 注入 BookingService 與 AuthService，會員 API 以 server-side session 判斷目前使用者。
  constructor(
    private readonly bookingService: BookingService,
    private readonly authService: AuthService,
  ) {}

  // 建立會員自己的預約，後端忽略任何前端 userId，只使用 session user。
  @Post('bookings')
  async createBooking(@Req() request: Request, @Body() body: CreateBookingDto) {
    const user = await this.authService.getCurrentUser(this.readSessionToken(request));
    const booking = await this.bookingService.createBooking(user.id, body.availabilitySlotId, body.note);

    return successResponse(booking);
  }

  // 查詢目前會員自己的預約列表，支援分頁與對外狀態篩選。
  @Get('me/bookings')
  async getMyBookings(
    @Req() request: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    const user = await this.authService.getCurrentUser(this.readSessionToken(request));
    const result = await this.bookingService.getMyBookings(
      user.id,
      this.parsePositiveInt(page, 1),
      this.parsePositiveInt(pageSize, 20),
      status,
    );

    return listResponse(result.items, result.meta);
  }

  // 查詢目前會員自己的單筆預約，不可取得他人預約。
  @Get('me/bookings/:bookingId')
  async getMyBooking(@Req() request: Request, @Param('bookingId') bookingId: string) {
    const user = await this.authService.getCurrentUser(this.readSessionToken(request));
    const booking = await this.bookingService.getMyBooking(user.id, bookingId);

    return successResponse(booking);
  }

  // 取消目前會員自己的預約，4 小時限制由後端最終判斷。
  @Post('me/bookings/:bookingId/cancel')
  @HttpCode(200)
  async cancelMyBooking(@Req() request: Request, @Param('bookingId') bookingId: string, @Body() body: CancelBookingDto) {
    const user = await this.authService.getCurrentUser(this.readSessionToken(request));
    const booking = await this.bookingService.cancelMyBooking(user.id, bookingId, body.reason);

    return successResponse(booking);
  }

  // 會員 Booking API 僅讀 booking_member_session，與後台 admin cookie 分離。
  private readSessionToken(request: Request): string | undefined {
    return readSessionTokenFromRequest(request, this.authService.getSessionCookieName('member'));
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
