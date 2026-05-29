import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import {
  AdminBookingRecord,
  AdminBookingStatus,
  AdminRepository,
  AdminServiceRecord,
  AdminServiceStatus,
  AdminSlotRecord,
  AdminSlotStatus,
  CancelledAdminBookingRecord,
  CreatedAdminBookingRecord,
} from './admin.repository';

type Page<T> = {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type AuditContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

@Injectable()
export class AdminService {
  // 注入 AdminRepository，保留後台跨資源管理資料存取邊界。
  constructor(private readonly adminRepository: AdminRepository) {}

  // 查詢後台服務列表，允許 Admin 看到 active、inactive 與 hidden。
  async getServices(page: number, pageSize: number, status: string | undefined): Promise<Page<AdminServiceRecord>> {
    const normalized = this.normalizePagination(page, pageSize);
    const result = await this.adminRepository.findServices(normalized.page, normalized.pageSize, this.parseServiceStatus(status));

    return this.toPage(result.items, normalized.page, normalized.pageSize, result.total);
  }

  // 查詢後台服務詳情，hidden 服務不可被公開 API 取得但 Admin 可查看。
  async getService(serviceId: string): Promise<AdminServiceRecord> {
    const service = await this.adminRepository.findServiceById(serviceId);

    if (!service) {
      throw new ApiException(404, 'SERVICE_NOT_FOUND', '服務不存在');
    }

    return service;
  }

  // 建立服務並寫入 admin.service.create audit log。
  async createService(
    input: {
      name: string;
      description?: string;
      imageUrl?: string;
      durationMinutes: number;
      price: number;
      status: AdminServiceStatus;
    },
    audit: AuditContext,
  ): Promise<AdminServiceRecord> {
    const service = await this.adminRepository.insertService({
      name: input.name.trim(),
      description: this.normalizeOptionalText(input.description),
      imageUrl: this.normalizeOptionalText(input.imageUrl),
      durationMinutes: input.durationMinutes,
      price: input.price,
      status: input.status,
    });

    await this.adminRepository.insertAuditLog(
      audit.actorUserId,
      'admin.service.create',
      'service',
      service.id,
      {
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
        status: service.status,
      },
      audit.ipAddress,
      audit.userAgent,
    );

    return service;
  }

  // 更新服務並寫入前後差異摘要，讓後續稽核能看到關鍵欄位變化。
  async updateService(
    serviceId: string,
    input: Partial<{
      name: string;
      description?: string;
      imageUrl?: string;
      durationMinutes: number;
      price: number;
      status: AdminServiceStatus;
    }>,
    audit: AuditContext,
  ): Promise<AdminServiceRecord> {
    const before = await this.getService(serviceId);
    const updated = await this.adminRepository.updateService(serviceId, {
      name: input.name?.trim(),
      description: Object.prototype.hasOwnProperty.call(input, 'description') ? this.normalizeOptionalText(input.description) : undefined,
      imageUrl: Object.prototype.hasOwnProperty.call(input, 'imageUrl') ? this.normalizeOptionalText(input.imageUrl) : undefined,
      durationMinutes: input.durationMinutes,
      price: input.price,
      status: input.status,
    });

    if (!updated) {
      throw new ApiException(404, 'SERVICE_NOT_FOUND', '服務不存在');
    }

    await this.adminRepository.insertAuditLog(
      audit.actorUserId,
      'admin.service.update',
      'service',
      updated.id,
      {
        before: this.pickServiceAuditFields(before),
        after: this.pickServiceAuditFields(updated),
      },
      audit.ipAddress,
      audit.userAgent,
    );

    return updated;
  }

  // 查詢後台時段列表，支援服務、狀態與時間區間篩選。
  async getAvailabilitySlots(
    page: number,
    pageSize: number,
    filters: { serviceId?: string; status?: string; from?: string; to?: string },
  ): Promise<Page<AdminSlotRecord>> {
    const normalized = this.normalizePagination(page, pageSize);
    const result = await this.adminRepository.findAvailabilitySlots(normalized.page, normalized.pageSize, {
      serviceId: filters.serviceId,
      status: this.parseSlotStatus(filters.status),
      from: this.parseOptionalDate(filters.from),
      to: this.parseOptionalDate(filters.to),
    });

    return this.toPage(result.items, normalized.page, normalized.pageSize, result.total);
  }

  // 查詢單筆後台時段詳情。
  async getAvailabilitySlot(slotId: string): Promise<AdminSlotRecord> {
    const slot = await this.adminRepository.findAvailabilitySlotById(slotId);

    if (!slot) {
      throw new ApiException(404, 'AVAILABILITY_SLOT_NOT_FOUND', '可預約時段不存在');
    }

    return slot;
  }

  // 建立單筆時段；只允許 active 服務，且時段長度必須符合服務設定。
  async createAvailabilitySlot(
    input: { serviceId: string; startAt: string; endAt: string; status: AdminSlotStatus },
    audit: AuditContext,
  ): Promise<AdminSlotRecord> {
    const service = await this.getService(input.serviceId);
    const startAt = this.parseDate(input.startAt);
    const endAt = this.parseDate(input.endAt);

    this.ensureActiveService(service);
    this.ensureSlotDuration(service.durationMinutes, startAt, endAt);

    const slot = await this.adminRepository.insertAvailabilitySlot(service.id, startAt, endAt, input.status);

    await this.adminRepository.insertAuditLog(
      audit.actorUserId,
      'admin.availability_slot.create',
      'availability_slot',
      slot.id,
      {
        serviceId: service.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
        status: slot.status,
      },
      audit.ipAddress,
      audit.userAgent,
    );

    return slot;
  }

  // 更新時段；若已有有效預約，不允許修改時間避免資料不一致。
  async updateAvailabilitySlot(
    slotId: string,
    input: Partial<{ startAt: string; endAt: string; status: AdminSlotStatus }>,
    audit: AuditContext,
  ): Promise<AdminSlotRecord> {
    const before = await this.getAvailabilitySlot(slotId);
    const startAt = input.startAt ? this.parseDate(input.startAt) : before.startAt;
    const endAt = input.endAt ? this.parseDate(input.endAt) : before.endAt;
    const changesTime = Boolean(input.startAt || input.endAt);

    if (changesTime && (await this.adminRepository.hasActiveBookingForSlot(slotId))) {
      throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段已有有效預約，無法修改時間');
    }

    this.ensureSlotDuration(before.service.durationMinutes, startAt, endAt);

    const updated = await this.adminRepository.updateAvailabilitySlot(slotId, {
      startAt: input.startAt ? startAt : undefined,
      endAt: input.endAt ? endAt : undefined,
      status: input.status,
    });

    if (!updated) {
      throw new ApiException(404, 'AVAILABILITY_SLOT_NOT_FOUND', '可預約時段不存在');
    }

    await this.adminRepository.insertAuditLog(
      audit.actorUserId,
      'admin.availability_slot.update',
      'availability_slot',
      updated.id,
      {
        before: this.pickSlotAuditFields(before),
        after: this.pickSlotAuditFields(updated),
      },
      audit.ipAddress,
      audit.userAgent,
    );

    return updated;
  }

  // 依 Asia/Taipei 本地日期與時間批次產生時段，重複 startAt 會跳過。
  async bulkGenerateAvailabilitySlots(
    input: {
      serviceId: string;
      timezone: 'Asia/Taipei';
      dateFrom: string;
      dateTo: string;
      weekdays: number[];
      timeRanges: Array<{ startTime: string; endTime: string }>;
    },
    audit: AuditContext,
  ): Promise<{ created: number; skipped: number }> {
    const service = await this.getService(input.serviceId);

    this.ensureActiveService(service);

    const dateFrom = this.parseDateOnly(input.dateFrom);
    const dateTo = this.parseDateOnly(input.dateTo);

    if (dateFrom.getTime() > dateTo.getTime()) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }

    const ranges = input.timeRanges.map((range) => this.parseTimeRange(range));
    let created = 0;
    let skipped = 0;

    for (const date of this.eachDate(dateFrom, dateTo)) {
      if (!input.weekdays.includes(this.toIsoWeekday(date))) {
        continue;
      }

      for (const range of ranges) {
        for (let cursor = range.startMinutes; cursor + service.durationMinutes <= range.endMinutes; cursor += service.durationMinutes) {
          const startAt = this.taipeiLocalToUtc(date, cursor);
          const endAt = new Date(startAt.getTime() + service.durationMinutes * 60 * 1000);

          if (await this.adminRepository.hasAvailabilitySlot(service.id, startAt)) {
            skipped += 1;
            continue;
          }

          await this.adminRepository.insertAvailabilitySlot(service.id, startAt, endAt, 'available');
          created += 1;
        }
      }
    }

    await this.adminRepository.insertAuditLog(
      audit.actorUserId,
      'admin.availability_slot.bulk_generate',
      'service',
      service.id,
      {
        timezone: input.timezone,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        created,
        skipped,
      },
      audit.ipAddress,
      audit.userAgent,
    );

    return { created, skipped };
  }

  // 依 email 查詢 active 會員，找不到時拋 404 供前端顯示錯誤。
  async lookupUserByEmail(email: string): Promise<{ id: string; email: string; displayName: string }> {
    const user = await this.adminRepository.findActiveUserByEmail(email.trim());

    if (!user) {
      throw new ApiException(404, 'USER_NOT_FOUND', '會員不存在');
    }

    return user;
  }

  // 查詢所有預約，Admin 可依狀態、服務、會員與時段篩選。
  async getBookings(
    page: number,
    pageSize: number,
    filters: { status?: string; serviceId?: string; userId?: string; from?: string; to?: string },
  ): Promise<Page<AdminBookingRecord>> {
    const normalized = this.normalizePagination(page, pageSize);
    const result = await this.adminRepository.findBookings(normalized.page, normalized.pageSize, {
      status: this.parseBookingStatus(filters.status),
      serviceId: filters.serviceId,
      userId: filters.userId,
      from: this.parseOptionalDate(filters.from),
      to: this.parseOptionalDate(filters.to),
    });

    return this.toPage(result.items, normalized.page, normalized.pageSize, result.total);
  }

  // Admin 替任意 active 會員建立預約，不受會員 1 小時限制但仍避免同時段重複預約。
  async createBooking(
    userId: string,
    availabilitySlotId: string,
    note: string | undefined,
    audit: AuditContext,
  ): Promise<CreatedAdminBookingRecord> {
    const queryRunner = this.adminRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (!(await this.adminRepository.hasActiveUser(queryRunner, userId))) {
        throw new ApiException(404, 'RESOURCE_NOT_FOUND', '資源不存在');
      }

      const slot = await this.adminRepository.findSlotForAdminBooking(queryRunner, availabilitySlotId);

      if (!slot) {
        throw new ApiException(404, 'BOOKING_SLOT_NOT_FOUND', '時段不存在');
      }

      if (slot.serviceStatus !== 'active') {
        throw new ApiException(409, 'SERVICE_NOT_ACTIVE', '服務不是啟用狀態');
      }

      if (slot.slotStatus !== 'available') {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      if (await this.adminRepository.hasActiveBookingForSlotInTransaction(queryRunner, availabilitySlotId)) {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      const booking = await this.adminRepository.insertAdminBooking(
        queryRunner,
        userId,
        slot.serviceId,
        availabilitySlotId,
        this.normalizeOptionalText(note),
      );

      await this.adminRepository.insertBookingStatusLog(queryRunner, booking.id, null, 'confirmed', audit.actorUserId, this.normalizeOptionalText(note));
      await this.adminRepository.insertAuditLogInTransaction(
        queryRunner,
        audit.actorUserId,
        'admin.booking.create',
        'booking',
        booking.id,
        {
          userId,
          availabilitySlotId,
        },
        audit.ipAddress,
        audit.userAgent,
      );
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

  // Admin 可更新預約備註，或改期至同服務的可用時段。
  async updateBooking(
    bookingId: string,
    updates: { note?: string; availabilitySlotId?: string },
    audit: AuditContext,
  ): Promise<AdminBookingRecord> {
    if (updates.availabilitySlotId) {
      return this.rescheduleBooking(bookingId, updates.availabilitySlotId, audit);
    }

    return this.updateBookingNoteOnly(bookingId, updates.note, audit);
  }

  // 僅更新備註，寫入 admin.booking.update audit log。
  private async updateBookingNoteOnly(bookingId: string, note: string | undefined, audit: AuditContext): Promise<AdminBookingRecord> {
    const before = await this.adminRepository.findBookingById(bookingId);

    if (!before) {
      throw new ApiException(404, 'BOOKING_NOT_FOUND', '預約不存在');
    }

    const updated = await this.adminRepository.updateBookingNote(bookingId, this.normalizeOptionalText(note));

    if (!updated) {
      throw new ApiException(404, 'BOOKING_NOT_FOUND', '預約不存在');
    }

    await this.adminRepository.insertAuditLog(
      audit.actorUserId,
      'admin.booking.update',
      'booking',
      updated.id,
      {
        before: {
          note: before.note,
        },
        after: {
          note: updated.note,
        },
      },
      audit.ipAddress,
      audit.userAgent,
    );

    return updated;
  }

  // 將 confirmed 預約改期至同服務可用時段，並寫入 admin.booking.reschedule audit log。
  private async rescheduleBooking(bookingId: string, availabilitySlotId: string, audit: AuditContext): Promise<AdminBookingRecord> {
    const queryRunner = this.adminRepository.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const booking = await this.adminRepository.findBookingForAdminReschedule(queryRunner, bookingId);

      if (!booking) {
        throw new ApiException(404, 'BOOKING_NOT_FOUND', '預約不存在');
      }

      if (booking.status !== 'confirmed') {
        throw new ApiException(409, 'BOOKING_NOT_RESCHEDULABLE', '預約狀態不可改期');
      }

      const slot = await this.adminRepository.findSlotForAdminBooking(queryRunner, availabilitySlotId);

      if (!slot) {
        throw new ApiException(404, 'BOOKING_SLOT_NOT_FOUND', '時段不存在');
      }

      if (slot.serviceId !== booking.serviceId) {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      if (slot.serviceStatus !== 'active') {
        throw new ApiException(409, 'SERVICE_NOT_ACTIVE', '服務不是啟用狀態');
      }

      if (slot.slotStatus !== 'available') {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      if (await this.adminRepository.hasActiveBookingForSlotExcludingBooking(queryRunner, availabilitySlotId, bookingId)) {
        throw new ApiException(409, 'BOOKING_SLOT_UNAVAILABLE', '此時段目前不可預約');
      }

      const previousSlotId = booking.availabilitySlotId;

      await this.adminRepository.updateBookingSlot(queryRunner, bookingId, slot.serviceId, availabilitySlotId);
      await this.adminRepository.insertAuditLogInTransaction(
        queryRunner,
        audit.actorUserId,
        'admin.booking.reschedule',
        'booking',
        bookingId,
        {
          before: { availabilitySlotId: previousSlotId },
          after: { availabilitySlotId },
        },
        audit.ipAddress,
        audit.userAgent,
      );
      await queryRunner.commitTransaction();

      const updated = await this.adminRepository.findBookingById(bookingId);

      if (!updated) {
        throw new ApiException(404, 'BOOKING_NOT_FOUND', '預約不存在');
      }

      return updated;
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

  // Admin 可取消任意 confirmed 且尚未 completed 的預約，不受會員 4 小時限制。
  async cancelBooking(bookingId: string, reason: string | undefined, audit: AuditContext): Promise<CancelledAdminBookingRecord> {
    const queryRunner = this.adminRepository.createQueryRunner();
    const normalizedReason = this.normalizeOptionalText(reason);

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const booking = await this.adminRepository.findBookingForAdminCancel(queryRunner, bookingId);

      if (!booking) {
        throw new ApiException(404, 'BOOKING_NOT_FOUND', '預約不存在');
      }

      if (booking.status !== 'confirmed' || booking.endAt.getTime() < Date.now()) {
        throw new ApiException(409, 'BOOKING_NOT_CANCELABLE', '預約狀態不可取消');
      }

      const cancelled = await this.adminRepository.cancelAdminBooking(queryRunner, bookingId, normalizedReason);

      await this.adminRepository.insertBookingStatusLog(queryRunner, bookingId, 'confirmed', 'cancelled', audit.actorUserId, normalizedReason);
      await this.adminRepository.insertAuditLogInTransaction(
        queryRunner,
        audit.actorUserId,
        'admin.booking.cancel',
        'booking',
        bookingId,
        {
          reason: normalizedReason,
        },
        audit.ipAddress,
        audit.userAgent,
      );
      await queryRunner.commitTransaction();

      return cancelled;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // 將分頁輸入收斂在安全範圍內，避免過大的 pageSize 造成查詢壓力。
  private normalizePagination(page: number, pageSize: number): { page: number; pageSize: number } {
    return {
      page: Math.max(1, page),
      pageSize: Math.min(Math.max(1, pageSize), 100),
    };
  }

  // 建立標準列表回應 meta。
  private toPage<T>(items: T[], page: number, pageSize: number, total: number): Page<T> {
    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  // 驗證並轉換服務狀態 query。
  private parseServiceStatus(value: string | undefined): AdminServiceStatus | undefined {
    if (!value) {
      return undefined;
    }

    if (value === 'active' || value === 'inactive' || value === 'hidden') {
      return value;
    }

    throw new ApiException(400, 'VALIDATION_ERROR', '輸入資料驗證失敗');
  }

  // 驗證並轉換時段狀態 query。
  private parseSlotStatus(value: string | undefined): AdminSlotStatus | undefined {
    if (!value) {
      return undefined;
    }

    if (value === 'available' || value === 'blocked' || value === 'inactive') {
      return value;
    }

    throw new ApiException(400, 'VALIDATION_ERROR', '輸入資料驗證失敗');
  }

  // 驗證並轉換 booking 對外狀態 query。
  private parseBookingStatus(value: string | undefined): AdminBookingStatus | undefined {
    if (!value) {
      return undefined;
    }

    if (value === 'confirmed' || value === 'cancelled' || value === 'completed') {
      return value;
    }

    throw new ApiException(400, 'VALIDATION_ERROR', '輸入資料驗證失敗');
  }

  // 解析 optional ISO 日期，無效日期回穩定驗證錯誤。
  private parseOptionalDate(value: string | undefined): Date | undefined {
    return value ? this.parseDate(value) : undefined;
  }

  // 解析 ISO 日期，避免 Invalid Date 流入 SQL。
  private parseDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new ApiException(400, 'VALIDATION_ERROR', '輸入資料驗證失敗');
    }

    return date;
  }

  // 解析 YYYY-MM-DD，使用 UTC 日期物件承載本地日期避免受伺服器時區影響。
  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));

    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }

    return date;
  }

  // 解析 HH:mm 時間區間，批次產生時段需使用分鐘方便切分。
  private parseTimeRange(value: { startTime: string; endTime: string }): { startMinutes: number; endMinutes: number } {
    const startMinutes = this.parseClock(value.startTime);
    const endMinutes = this.parseClock(value.endTime);

    if (endMinutes <= startMinutes) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }

    return { startMinutes, endMinutes };
  }

  // 解析 HH:mm 成當日本地分鐘數。
  private parseClock(value: string): number {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

    if (!match) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }

    return Number(match[1]) * 60 + Number(match[2]);
  }

  // 逐日列舉 dateFrom 到 dateTo，包含首尾日期。
  private *eachDate(dateFrom: Date, dateTo: Date): Generator<Date> {
    for (let cursor = new Date(dateFrom); cursor.getTime() <= dateTo.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      yield new Date(cursor);
    }
  }

  // 將 UTC 承載的本地日期轉成 ISO weekday。
  private toIsoWeekday(date: Date): number {
    const weekday = date.getUTCDay();

    return weekday === 0 ? 7 : weekday;
  }

  // 將 Asia/Taipei 本地日期時間轉成 UTC；MVP 不處理其他時區或 DST。
  private taipeiLocalToUtc(date: Date, minutes: number): Date {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours - 8, mins));
  }

  // 確認服務可建立新時段或新預約。
  private ensureActiveService(service: AdminServiceRecord): void {
    if (service.status !== 'active') {
      throw new ApiException(409, 'SERVICE_NOT_ACTIVE', '服務不是啟用狀態');
    }
  }

  // 驗證時段結束時間晚於開始時間，且長度符合服務 durationMinutes。
  private ensureSlotDuration(durationMinutes: number, startAt: Date, endAt: Date): void {
    const durationMs = endAt.getTime() - startAt.getTime();

    if (durationMs <= 0 || durationMs !== durationMinutes * 60 * 1000) {
      throw new ApiException(400, 'INVALID_TIME_RANGE', '時間區間格式錯誤');
    }
  }

  // 將 optional 文字欄位去除前後空白，空字串統一存為 null。
  private normalizeOptionalText(value: string | undefined): string | null {
    const normalized = value?.trim();

    return normalized ? normalized : null;
  }

  // 產生服務 audit metadata 的精簡欄位。
  private pickServiceAuditFields(service: AdminServiceRecord): Record<string, unknown> {
    return {
      name: service.name,
      description: service.description,
      imageUrl: service.imageUrl,
      durationMinutes: service.durationMinutes,
      price: service.price,
      status: service.status,
    };
  }

  // 產生時段 audit metadata 的精簡欄位。
  private pickSlotAuditFields(slot: AdminSlotRecord): Record<string, unknown> {
    return {
      serviceId: slot.serviceId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      status: slot.status,
    };
  }

  // 判斷 partial unique index 衝突，作為交易外競態條件的最後保護。
  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
  }
}
