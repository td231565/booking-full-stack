import { Test } from '@nestjs/testing';
import { faker } from '@faker-js/faker';
import { PublicServiceRecord, ServiceCatalogRepository } from './service-catalog.repository';
import { ServiceCatalogService } from './service-catalog.service';

// 建立測試用公開服務資料，供 service-catalog 單元測試重複使用。
function buildPublicService(overrides: Partial<PublicServiceRecord> = {}): PublicServiceRecord {
  return {
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    imageUrl: null,
    durationMinutes: 60,
    price: 1000,
    status: 'active',
    ...overrides,
  };
}

describe('ServiceCatalogService', () => {
  let serviceCatalogService: ServiceCatalogService;
  let serviceCatalogRepository: {
    findPublicServices: ReturnType<typeof vi.fn>;
    findPublicServiceById: ReturnType<typeof vi.fn>;
    findAvailableSlots: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    serviceCatalogRepository = {
      findPublicServices: vi.fn(),
      findPublicServiceById: vi.fn(),
      findAvailableSlots: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ServiceCatalogService,
        {
          provide: ServiceCatalogRepository,
          useValue: serviceCatalogRepository,
        },
      ],
    }).compile();

    serviceCatalogService = moduleRef.get(ServiceCatalogService);
  });

  // getPublicService：不存在或 hidden 服務對外統一回 SERVICE_NOT_FOUND。
  it('getPublicService 在 serviceId 不存在時拋出 SERVICE_NOT_FOUND', async () => {
    serviceCatalogRepository.findPublicServiceById.mockResolvedValue(null);

    await expect(serviceCatalogService.getPublicService(faker.string.uuid())).rejects.toMatchObject({
      code: 'SERVICE_NOT_FOUND',
    });
  });

  // getPublicService：存在時回傳服務詳情。
  it('getPublicService 在服務存在時回傳詳情', async () => {
    const service = buildPublicService();

    serviceCatalogRepository.findPublicServiceById.mockResolvedValue(service);

    await expect(serviceCatalogService.getPublicService(service.id)).resolves.toEqual(service);
  });

  // getPublicServices：分頁 meta 需依 total 與 pageSize 正確計算 totalPages。
  it('getPublicServices 會正確計算 pagination meta', async () => {
    const items = [buildPublicService(), buildPublicService()];

    serviceCatalogRepository.findPublicServices.mockResolvedValue({
      items,
      total: 25,
    });

    await expect(serviceCatalogService.getPublicServices(2, 10)).resolves.toEqual({
      items,
      meta: {
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      },
    });
  });

  // getPublicServices：page 與 pageSize 需正規化後再查詢 repository。
  it('getPublicServices 會正規化 page 與 pageSize', async () => {
    const items = [buildPublicService()];

    serviceCatalogRepository.findPublicServices.mockResolvedValue({
      items,
      total: 0,
    });

    await expect(serviceCatalogService.getPublicServices(0, 500)).resolves.toEqual({
      items,
      meta: {
        page: 1,
        pageSize: 100,
        total: 0,
        totalPages: 1,
      },
    });

    expect(serviceCatalogRepository.findPublicServices).toHaveBeenCalledWith(1, 100);
  });

  // getPublicAvailability：服務不存在時沿用 getPublicService 的 SERVICE_NOT_FOUND。
  it('getPublicAvailability 在服務不存在時拋出 SERVICE_NOT_FOUND', async () => {
    serviceCatalogRepository.findPublicServiceById.mockResolvedValue(null);

    await expect(serviceCatalogService.getPublicAvailability(faker.string.uuid(), undefined, undefined)).rejects.toMatchObject({
      code: 'SERVICE_NOT_FOUND',
    });
  });

  // getPublicAvailability：結束時間早於開始時間時回傳 INVALID_TIME_RANGE。
  it('getPublicAvailability 在 to 早於 from 時拋出 INVALID_TIME_RANGE', async () => {
    const service = buildPublicService();

    serviceCatalogRepository.findPublicServiceById.mockResolvedValue(service);

    await expect(
      serviceCatalogService.getPublicAvailability(
        service.id,
        '2030-01-10T00:00:00.000Z',
        '2030-01-01T00:00:00.000Z',
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_TIME_RANGE',
    });
  });

  // getPublicAvailability：日期格式錯誤時回傳 INVALID_TIME_RANGE。
  it('getPublicAvailability 在日期格式錯誤時拋出 INVALID_TIME_RANGE', async () => {
    const service = buildPublicService();

    serviceCatalogRepository.findPublicServiceById.mockResolvedValue(service);

    await expect(
      serviceCatalogService.getPublicAvailability(service.id, 'not-a-date', undefined),
    ).rejects.toMatchObject({
      code: 'INVALID_TIME_RANGE',
    });
  });

  // getPublicAvailability：成功時委派 repository 查詢可預約時段。
  it('getPublicAvailability 成功時回傳可預約時段', async () => {
    const service = buildPublicService();
    const slots = [
      {
        id: faker.string.uuid(),
        serviceId: service.id,
        startAt: new Date('2030-01-02T02:00:00.000Z'),
        endAt: new Date('2030-01-02T03:00:00.000Z'),
        status: 'available' as const,
      },
    ];

    serviceCatalogRepository.findPublicServiceById.mockResolvedValue(service);
    serviceCatalogRepository.findAvailableSlots.mockResolvedValue(slots);

    await expect(
      serviceCatalogService.getPublicAvailability(
        service.id,
        '2030-01-01T00:00:00.000Z',
        '2030-01-31T00:00:00.000Z',
      ),
    ).resolves.toEqual(slots);

    expect(serviceCatalogRepository.findAvailableSlots).toHaveBeenCalledWith(
      service.id,
      new Date('2030-01-01T00:00:00.000Z'),
      new Date('2030-01-31T00:00:00.000Z'),
    );
  });
});
