import { Test } from '@nestjs/testing';
import { faker } from '@faker-js/faker';
import { QueryRunner } from 'typeorm';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';

// 建立可控制的 QueryRunner mock，讓 createBooking / cancelMyBooking 能在單元測試跑完交易流程。
function createQueryRunnerMock() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
  } as unknown as QueryRunner;
}

// 建立符合預約規則的時段 mock，預設為 2 小時後開始且可預約。
function buildBookableSlot(overrides: Partial<{
  id: string;
  serviceId: string;
  serviceStatus: 'active' | 'inactive' | 'hidden';
  slotStatus: 'available' | 'blocked' | 'inactive';
  startAt: Date;
}> = {}) {
  return {
    id: faker.string.uuid(),
    serviceId: faker.string.uuid(),
    serviceStatus: 'active' as const,
    slotStatus: 'available' as const,
    startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe('BookingService', () => {
  let bookingService: BookingService;
  let queryRunner: QueryRunner;
  let bookingRepository: {
    createQueryRunner: ReturnType<typeof vi.fn>;
    findSlotForBooking: ReturnType<typeof vi.fn>;
    hasActiveBookingForUserSlot: ReturnType<typeof vi.fn>;
    hasActiveBookingForSlot: ReturnType<typeof vi.fn>;
    insertBooking: ReturnType<typeof vi.fn>;
    insertStatusLog: ReturnType<typeof vi.fn>;
    findMyBookingForCancel: ReturnType<typeof vi.fn>;
    cancelMyBooking: ReturnType<typeof vi.fn>;
    findMyBookings: ReturnType<typeof vi.fn>;
    findMyBookingById: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queryRunner = createQueryRunnerMock();
    bookingRepository = {
      createQueryRunner: vi.fn(() => queryRunner),
      findSlotForBooking: vi.fn(),
      hasActiveBookingForUserSlot: vi.fn(),
      hasActiveBookingForSlot: vi.fn(),
      insertBooking: vi.fn(),
      insertStatusLog: vi.fn(),
      findMyBookingForCancel: vi.fn(),
      cancelMyBooking: vi.fn(),
      findMyBookings: vi.fn(),
      findMyBookingById: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        {
          provide: BookingRepository,
          useValue: bookingRepository,
        },
      ],
    }).compile();

    bookingService = moduleRef.get(BookingService);
  });

  // createBooking：成功時提交交易並寫入狀態紀錄。
  it('createBooking 成功時提交交易並寫入 confirmed 狀態紀錄', async () => {
    const userId = faker.string.uuid();
    const slot = buildBookableSlot();
    const booking = {
      id: faker.string.uuid(),
      userId,
      serviceId: slot.serviceId,
      availabilitySlotId: slot.id,
      status: 'confirmed' as const,
      note: null,
      createdAt: new Date(),
    };

    bookingRepository.findSlotForBooking.mockResolvedValue(slot);
    bookingRepository.hasActiveBookingForUserSlot.mockResolvedValue(false);
    bookingRepository.hasActiveBookingForSlot.mockResolvedValue(false);
    bookingRepository.insertBooking.mockResolvedValue(booking);

    await expect(bookingService.createBooking(userId, slot.id, '  ')).resolves.toEqual(booking);

    expect(bookingRepository.insertBooking).toHaveBeenCalledWith(queryRunner, userId, slot.serviceId, slot.id, null);
    expect(bookingRepository.insertStatusLog).toHaveBeenCalledWith(queryRunner, booking.id, null, 'confirmed', userId, null);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  // createBooking：時段不存在時回傳 BOOKING_SLOT_NOT_FOUND。
  it('createBooking 在時段不存在時拋出 BOOKING_SLOT_NOT_FOUND', async () => {
    bookingRepository.findSlotForBooking.mockResolvedValue(null);

    await expect(
      bookingService.createBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_SLOT_NOT_FOUND',
    });
  });

  // createBooking：服務非 active 時不可預約。
  it('createBooking 在服務非 active 時拋出 SERVICE_NOT_ACTIVE', async () => {
    bookingRepository.findSlotForBooking.mockResolvedValue(buildBookableSlot({ serviceStatus: 'inactive' }));

    await expect(
      bookingService.createBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'SERVICE_NOT_ACTIVE',
    });
  });

  // createBooking：時段非 available 時不可預約。
  it('createBooking 在時段非 available 時拋出 BOOKING_SLOT_UNAVAILABLE', async () => {
    bookingRepository.findSlotForBooking.mockResolvedValue(buildBookableSlot({ slotStatus: 'blocked' }));

    await expect(
      bookingService.createBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_SLOT_UNAVAILABLE',
    });
  });

  // createBooking：1 小時內開始的時段不可預約，避免臨時預約造成營運風險。
  it('createBooking 在時段開始時間不足 1 小時後拋出 BOOKING_TOO_SOON', async () => {
    bookingRepository.findSlotForBooking.mockResolvedValue(
      buildBookableSlot({ startAt: new Date(Date.now() + 30 * 60 * 1000) }),
    );

    await expect(
      bookingService.createBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_TOO_SOON',
    });
  });

  // createBooking：同一會員不可重複預約同一時段。
  it('createBooking 在會員已預約同一時段時拋出 BOOKING_DUPLICATED', async () => {
    bookingRepository.findSlotForBooking.mockResolvedValue(buildBookableSlot());
    bookingRepository.hasActiveBookingForUserSlot.mockResolvedValue(true);

    await expect(
      bookingService.createBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_DUPLICATED',
    });
  });

  // createBooking：時段已被他人預約時回傳 BOOKING_SLOT_UNAVAILABLE。
  it('createBooking 在時段已被他人預約時拋出 BOOKING_SLOT_UNAVAILABLE', async () => {
    bookingRepository.findSlotForBooking.mockResolvedValue(buildBookableSlot());
    bookingRepository.hasActiveBookingForUserSlot.mockResolvedValue(false);
    bookingRepository.hasActiveBookingForSlot.mockResolvedValue(true);

    await expect(
      bookingService.createBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_SLOT_UNAVAILABLE',
    });
  });

  // createBooking：unique constraint 衝突時轉成 BOOKING_SLOT_UNAVAILABLE，作為競態兜底。
  it('createBooking 在 unique constraint 衝突時拋出 BOOKING_SLOT_UNAVAILABLE', async () => {
    bookingRepository.findSlotForBooking.mockResolvedValue(buildBookableSlot());
    bookingRepository.hasActiveBookingForUserSlot.mockResolvedValue(false);
    bookingRepository.hasActiveBookingForSlot.mockResolvedValue(false);
    bookingRepository.insertBooking.mockRejectedValue({ code: '23505' });

    await expect(
      bookingService.createBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_SLOT_UNAVAILABLE',
    });

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  // cancelMyBooking：成功時提交交易並寫入 cancelled 狀態紀錄。
  it('cancelMyBooking 成功時提交交易並寫入 cancelled 狀態紀錄', async () => {
    const userId = faker.string.uuid();
    const bookingId = faker.string.uuid();
    const cancelledBooking = {
      id: bookingId,
      status: 'cancelled' as const,
      cancelledBy: 'user' as const,
      cancelReason: '臨時有事',
      cancelledAt: new Date(),
    };

    bookingRepository.findMyBookingForCancel.mockResolvedValue({
      id: bookingId,
      status: 'confirmed',
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });
    bookingRepository.cancelMyBooking.mockResolvedValue(cancelledBooking);

    await expect(bookingService.cancelMyBooking(userId, bookingId, '  臨時有事  ')).resolves.toEqual(cancelledBooking);

    expect(bookingRepository.cancelMyBooking).toHaveBeenCalledWith(queryRunner, bookingId, '臨時有事');
    expect(bookingRepository.insertStatusLog).toHaveBeenCalledWith(
      queryRunner,
      bookingId,
      'confirmed',
      'cancelled',
      userId,
      '臨時有事',
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  // cancelMyBooking：預約不存在時回傳 BOOKING_NOT_FOUND。
  it('cancelMyBooking 在預約不存在時拋出 BOOKING_NOT_FOUND', async () => {
    bookingRepository.findMyBookingForCancel.mockResolvedValue(null);

    await expect(
      bookingService.cancelMyBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_NOT_FOUND',
    });
  });

  // cancelMyBooking：距離開始少於 4 小時不可取消，後端為最終判斷來源。
  it('cancelMyBooking 在距離開始不足 4 小時時拋出 BOOKING_CANCEL_TOO_LATE', async () => {
    bookingRepository.findMyBookingForCancel.mockResolvedValue({
      id: faker.string.uuid(),
      status: 'confirmed',
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    });

    await expect(
      bookingService.cancelMyBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_CANCEL_TOO_LATE',
    });
  });

  // cancelMyBooking：已取消或非 confirmed 狀態不可再次取消。
  it('cancelMyBooking 在已取消預約時拋出 BOOKING_NOT_CANCELABLE', async () => {
    bookingRepository.findMyBookingForCancel.mockResolvedValue({
      id: faker.string.uuid(),
      status: 'cancelled',
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    await expect(
      bookingService.cancelMyBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_NOT_CANCELABLE',
    });
  });

  // cancelMyBooking：已結束的預約對外為 completed，不可取消。
  it('cancelMyBooking 在預約已結束時拋出 BOOKING_NOT_CANCELABLE', async () => {
    bookingRepository.findMyBookingForCancel.mockResolvedValue({
      id: faker.string.uuid(),
      status: 'confirmed',
      startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await expect(
      bookingService.cancelMyBooking(faker.string.uuid(), faker.string.uuid(), undefined),
    ).rejects.toMatchObject({
      code: 'BOOKING_NOT_CANCELABLE',
    });
  });

  // getMyBookings：分頁參數需正規化並正確計算 meta。
  it('getMyBookings 會正規化分頁參數並計算 meta', async () => {
    const items = [{ id: faker.string.uuid() }];

    bookingRepository.findMyBookings.mockResolvedValue({ items, total: 0 });

    await expect(bookingService.getMyBookings(faker.string.uuid(), 0, 500, undefined)).resolves.toEqual({
      items,
      meta: {
        page: 1,
        pageSize: 100,
        total: 0,
        totalPages: 1,
      },
    });

    expect(bookingRepository.findMyBookings).toHaveBeenCalledWith(expect.any(String), 1, 100, undefined);
  });

  // getMyBookings：非法 status 查詢參數回傳 VALIDATION_ERROR。
  it('getMyBookings 在非法 status 時拋出 VALIDATION_ERROR', async () => {
    await expect(bookingService.getMyBookings(faker.string.uuid(), 1, 10, 'invalid')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  // getMyBooking：找不到預約時回傳 BOOKING_NOT_FOUND。
  it('getMyBooking 在預約不存在時拋出 BOOKING_NOT_FOUND', async () => {
    bookingRepository.findMyBookingById.mockResolvedValue(null);

    await expect(bookingService.getMyBooking(faker.string.uuid(), faker.string.uuid())).rejects.toMatchObject({
      code: 'BOOKING_NOT_FOUND',
    });
  });

  // getMyBooking：存在時回傳預約詳情。
  it('getMyBooking 在預約存在時回傳詳情', async () => {
    const booking = { id: faker.string.uuid(), status: 'confirmed' };

    bookingRepository.findMyBookingById.mockResolvedValue(booking);

    await expect(bookingService.getMyBooking(faker.string.uuid(), booking.id)).resolves.toEqual(booking);
  });
});
