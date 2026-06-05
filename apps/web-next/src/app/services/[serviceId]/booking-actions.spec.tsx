import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '../../../../test/msw/server';
import { BookingActions } from './booking-actions';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

const slot = {
  id: 'slot-1',
  serviceId: 'service-1',
  startAt: '2026-05-22T10:00:00.000Z',
  endAt: '2026-05-22T11:00:00.000Z',
  status: 'available' as const,
};

describe('BookingActions', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  // 成功建立預約時按鈕會進入 submitting 狀態，完成後導向預約詳情。
  it('點擊預約成功後按鈕狀態更新並導向預約詳情', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', async () => {
        // 延遲回應以便觀察 isSubmitting 期間的按鈕文案。
        await delay(100);
        return HttpResponse.json({
          data: {
            id: 'booking-1',
            userId: 'user-1',
            serviceId: 'service-1',
            availabilitySlotId: 'slot-1',
            status: 'confirmed',
            note: null,
            createdAt: '2026-05-21T10:00:00.000Z',
          },
        });
      }),
    );

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '建立中...' })).toBeDisabled();
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/my/bookings/booking-1?promptCalendar=1');
    });

    expect(screen.getByRole('button', { name: '預約' })).toBeEnabled();
    expect(screen.queryByText('此時段目前不可預約，請重新整理後選擇其他時段。')).not.toBeInTheDocument();
  });

  // BOOKING_SLOT_UNAVAILABLE 應顯示時段不可預約訊息，並刷新頁面同步 availability。
  it('MSW 回 BOOKING_SLOT_UNAVAILABLE 時顯示錯誤', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json(
          { error: { code: 'BOOKING_SLOT_UNAVAILABLE', message: '此時段目前不可預約' } },
          { status: 409 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));

    expect(
      await screen.findByText('此時段目前不可預約，請重新整理後選擇其他時段。'),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  // UNAUTHENTICATED 應直接 redirect 登入頁並帶回原本路徑，不顯示錯誤訊息。
  it('UNAUTHENTICATED 時導向登入頁並帶 redirect 參數', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: '請先登入' } },
          { status: 401 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/login?redirect=/services/service-1');
    });

    // 導向登入而非顯示錯誤訊息。
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  // BOOKING_TOO_SOON 應顯示時間限制提示。
  it('MSW 回 BOOKING_TOO_SOON 時顯示只能預約 1 小時後訊息', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json(
          { error: { code: 'BOOKING_TOO_SOON', message: '時段太近' } },
          { status: 422 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));

    expect(await screen.findByText('只能預約 1 小時後開始的時段。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // BOOKING_DUPLICATED 應告知使用者此時段已預約過。
  it('MSW 回 BOOKING_DUPLICATED 時顯示重複預約訊息', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json(
          { error: { code: 'BOOKING_DUPLICATED', message: '已預約' } },
          { status: 409 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));

    expect(await screen.findByText('你已預約過此時段。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // RATE_LIMITED 走 getApiErrorMessage 通用路徑。
  it('MSW 回 RATE_LIMITED 時顯示操作太頻繁', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'too many requests' } },
          { status: 429 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));

    expect(await screen.findByText('操作太頻繁，請稍後再試。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // 網路層失敗應走 catch fallback，不顯示業務錯誤碼。
  it('網路錯誤時顯示系統暫時無法處理請求', async () => {
    server.use(http.post('http://127.0.0.1:3001/api/bookings', () => HttpResponse.error()));

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));

    expect(await screen.findByText('系統暫時無法處理請求。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // 再次送出前應清除前一次的錯誤訊息。
  it('再次送出時清除前一次錯誤訊息', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json(
          { error: { code: 'BOOKING_TOO_SOON', message: '時段太近' } },
          { status: 422 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<BookingActions serviceId="service-1" slot={slot} />);

    await user.click(screen.getByRole('button', { name: '預約' }));
    expect(await screen.findByText('只能預約 1 小時後開始的時段。')).toBeInTheDocument();

    // 第二次改為成功，確認前一次錯誤訊息被清除。
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json({
          data: {
            id: 'booking-1',
            userId: 'user-1',
            serviceId: 'service-1',
            availabilitySlotId: 'slot-1',
            status: 'confirmed',
            note: null,
            createdAt: '2026-05-21T10:00:00.000Z',
          },
        });
      }),
    );

    await user.click(screen.getByRole('button', { name: '預約' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/my/bookings/booking-1?promptCalendar=1');
    });

    expect(screen.queryByText('只能預約 1 小時後開始的時段。')).not.toBeInTheDocument();
  });
});
