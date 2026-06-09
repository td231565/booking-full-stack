import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@test/msw/server';
import { BookingDetailClient } from './booking-detail';

const replace = vi.fn();
const push = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace,
    refresh: vi.fn(),
  }),
  useSearchParams: () => searchParams,
}));

const bookingDetail = {
  id: 'booking-1',
  status: 'confirmed' as const,
  service: {
    id: 'service-1',
    name: '按摩服務',
    durationMinutes: 60,
    price: 1000,
  },
  slot: {
    id: 'slot-1',
    startAt: '2026-06-01T10:00:00.000Z',
    endAt: '2026-06-01T11:00:00.000Z',
  },
  note: '備註',
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  createdAt: '2026-05-21T10:00:00.000Z',
  updatedAt: '2026-05-21T10:00:00.000Z',
};

describe('BookingDetailClient', () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    searchParams = new URLSearchParams();

    server.use(
      http.get('http://127.0.0.1:3001/api/me/bookings/booking-1', () => {
        return HttpResponse.json({ data: bookingDetail });
      }),
    );
  });

  it('promptCalendar=1 載入後顯示 Dialog 並 replace 清除 query', async () => {
    searchParams = new URLSearchParams('promptCalendar=1');

    render(<BookingDetailClient bookingId="booking-1" />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('是否加入日曆？')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/my/bookings/booking-1', { scroll: false });
  });

  it('詳情頁常駐加入日曆按鈕', async () => {
    render(<BookingDetailClient bookingId="booking-1" />);

    expect(await screen.findByRole('button', { name: '加入日曆' })).toBeInTheDocument();
  });

  it('Dialog 點稍後可關閉', async () => {
    searchParams = new URLSearchParams('promptCalendar=1');
    const user = userEvent.setup();

    render(<BookingDetailClient bookingId="booking-1" />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '稍後' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('當日天氣', () => {
    it('載入中顯示 loading 文案', async () => {
      server.use(
        http.get('*/api/weather', async () => {
          await delay(200);
          return HttpResponse.json({ data: null });
        }),
      );

      render(<BookingDetailClient bookingId="booking-1" />);

      expect(await screen.findByText('正在載入天氣...')).toBeInTheDocument();
    });

    it('成功顯示溫度、天氣描述、地點', async () => {
      server.use(
        http.get('*/api/weather', () => {
          return HttpResponse.json({
            data: {
              date: '2026-06-01',
              locationLabel: '台北市信義區',
              avgTempC: 28,
              minTempC: 24,
              maxTempC: 32,
              condition: '晴',
              chanceOfRain: 20,
            },
          });
        }),
      );

      render(<BookingDetailClient bookingId="booking-1" />);

      expect(await screen.findByText(/晴/)).toBeInTheDocument();
      expect(screen.getByText(/平均 28°C/)).toBeInTheDocument();
      expect(screen.getByText('台北市信義區')).toBeInTheDocument();
      expect(screen.getByText('預約詳情')).toBeInTheDocument();
    });

    it('超出預報範圍顯示近 3 日 Notice', async () => {
      server.use(
        http.get('*/api/weather', () => {
          return HttpResponse.json({ data: null });
        }),
      );

      render(<BookingDetailClient bookingId="booking-1" />);

      expect(await screen.findByText('目前僅提供近 3 日天氣預報，請出發前再查看。')).toBeInTheDocument();
    });

    it('502 顯示錯誤提示且不影響預約詳情其他區塊', async () => {
      server.use(
        http.get('*/api/weather', () => {
          return HttpResponse.json(
            {
              error: {
                code: 'WEATHER_UPSTREAM_ERROR',
                message: '暫時無法取得天氣，請稍後再試。',
              },
            },
            { status: 502 },
          );
        }),
      );

      render(<BookingDetailClient bookingId="booking-1" />);

      expect(await screen.findByText('暫時無法取得天氣，請稍後再試。')).toBeInTheDocument();
      expect(screen.getByText('按摩服務')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '加入日曆' })).toBeInTheDocument();
    });
  });
});
