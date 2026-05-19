import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import {
  BookingDetailRecord,
  BookingListRecord,
  BookingRepository,
  BookingStatus,
  CancelledBookingRecord,
  CreatedBookingRecord,
} from './booking.repository';

export type BookingPage = {
  items: BookingListRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class BookingService {
  // 注入 BookingRepository，保留預約交易與資料一致性規則的資料存取邊界。
  constructor(private readonly bookingRepository: BookingRepository) {}

  // 建立會員預約，使用交易與 row lock 避免同時搶同一時段造成超賣。
  async createBooking(userId: string, availabilitySlotId: string, note: string | undefined): Promise<CreatedBookingRecord> {
    const queryRunner = this.bookingRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const slot = await this.bookingRepository.findSlotForBooking(queryRunner, availabilitySlotId);

      if (!slot) {
        throw new ApiException(404, 'BOOKING_SLOT_NOT_FOUND', '時段不存在');
      }

      if (slot.serviceStatus !== 'active') {
        throw new ApiException(409, 'SERVICE_NOT_ACTIVE', '服務不是啟用狀態');
      }

      if (slot.slotStatus !== 'available') {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      if (slot.startAt.getTime() < Date.now() + 60 * 60 * 1000) {
        throw new ApiException(409, 'BOOKING_TOO_SOON', '不可預約 1 小時內開始的時段');
      }

      if (await this.bookingRepository.hasActiveBookingForUserSlot(queryRunner, userId, availabilitySlotId)) {
        throw new ApiException(409, 'BOOKING_DUPLICATED', '使用者已預約同一時段');
      }

      if (await this.bookingRepository.hasActiveBookingForSlot(queryRunner, availabilitySlotId)) {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      const booking = await this.bookingRepository.insertBooking(
        queryRunner,
        userId,
        slot.serviceId,
        availabilitySlotId,
        this.normalizeOptionalText(note),
      );

      await this.bookingRepository.insertStatusLog(queryRunner, booking.id, null, 'confirmed', userId, null);
      await queryRunner.commitTransaction();

      return booking;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (this.isUniqueViolation(error)) {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // 取得會員自己的預約列表，分頁與狀態值會在 service 層正規化。
  async getMyBookings(userId: string, page: number, pageSize: number, status: string | undefined): Promise<BookingPage> {
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.min(Math.max(1, pageSize), 100);
    const normalizedStatus = this.parseStatus(status);
    const { items, total } = await this.bookingRepository.findMyBookings(
      userId,
      normalizedPage,
      normalizedPageSize,
      normalizedStatus,
    );

    return {
      items,
      meta: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
      },
    };
  }

  // 取得會員自己的預約詳情，不存在或不屬於自己都回 BOOKING_NOT_FOUND。
  async getMyBooking(userId: string, bookingId: string): Promise<BookingDetailRecord> {
    const booking = await this.bookingRepository.findMyBookingById(userId, bookingId);

    if (!booking) {
      throw new ApiException(404, 'BOOKING_NOT_FOUND', '預約不存在');
    }

    return booking;
  }

  // 取消會員自己的預約，後端是 4 小時限制與狀態判斷的最終來源。
  async cancelMyBooking(userId: string, bookingId: string, reason: string | undefined): Promise<CancelledBookingRecord> {
    const queryRunner = this.bookingRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const booking = await this.bookingRepository.findMyBookingForCancel(queryRunner, userId, bookingId);

      if (!booking) {
        throw new ApiException(404, 'BOOKING_NOT_FOUND', '預約不存在');
      }

      if (booking.status !== 'confirmed' || booking.endAt.getTime() < Date.now()) {
        throw new ApiException(409, 'BOOKING_NOT_CANCELABLE', '預約狀態不可取消');
      }

      if (booking.startAt.getTime() < Date.now() + 4 * 60 * 60 * 1000) {
        throw new ApiException(409, 'BOOKING_CANCEL_TOO_LATE', '距離開始時間少於 4 小時');
      }

      const cancelledBooking = await this.bookingRepository.cancelMyBooking(queryRunner, bookingId, this.normalizeOptionalText(reason));

      await this.bookingRepository.insertStatusLog(
        queryRunner,
        bookingId,
        'confirmed',
        'cancelled',
        userId,
        this.normalizeOptionalText(reason),
      );
      await queryRunner.commitTransaction();

      return cancelledBooking;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // 將 optional 文字欄位去除前後空白，空字串統一存為 null。
  private normalizeOptionalText(value: string | undefined): string | null {
    const normalized = value?.trim();

    return normalized ? normalized : null;
  }

  // 限制 status query 只能使用 API 契約定義的三種對外狀態。
  private parseStatus(value: string | undefined): BookingStatus | undefined {
    if (!value) {
      return undefined;
    }

    if (value === 'confirmed' || value === 'cancelled' || value === 'completed') {
      return value;
    }

    throw new ApiException(400, 'VALIDATION_ERROR', '輸入資料驗證失敗');
  }

  // 判斷 partial unique index 衝突，作為交易外競態條件的最後保護。
  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
  }
}
