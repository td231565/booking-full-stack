import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@test/msw/server';
import { BookingsList } from './bookings-list';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}));

const confirmedBooking = {
  id: 'booking-confirmed',
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
  createdAt: '2026-05-21T10:00:00.000Z',
};

const cancelledBooking = {
  ...confirmedBooking,
  id: 'booking-cancelled',
  status: 'cancelled' as const,
};

describe('BookingsList', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('confirmed 列顯示加入日曆，cancelled 列不顯示', async () => {
    server.use(
      http.get('http://127.0.0.1:3001/api/me/bookings', () => {
        return HttpResponse.json({
          data: [confirmedBooking, cancelledBooking],
        });
      }),
    );

    render(<BookingsList />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '加入日曆' })).toHaveLength(1);
      expect(screen.getAllByRole('link', { name: '查看' })).toHaveLength(2);
    });
  });
});
