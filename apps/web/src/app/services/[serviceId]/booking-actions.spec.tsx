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
      expect(push).toHaveBeenCalledWith('/my/bookings/booking-1');
    });

    expect(screen.getByRole('button', { name: '預約' })).toBeEnabled();
    expect(screen.queryByText('此時段目前不可預約，請重新整理後選擇其他時段。')).not.toBeInTheDocument();
  });

  // BOOKING_SLOT_UNAVAILABLE 應顯示時段不可預約訊息。
  it('MSW 回 BOOKING_SLOT_UNAVAILABLE 時顯示錯誤', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/bookings', () => {
        return HttpResponse.json(
          {
            error: {
              code: 'BOOKING_SLOT_UNAVAILABLE',
              message: '此時段目前不可預約',
            },
          },
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
});
