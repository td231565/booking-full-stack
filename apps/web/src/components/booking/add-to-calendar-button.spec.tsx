import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { downloadBookingIcs } from '@/lib/calendar/download-booking-ics';
import { AddToCalendarButton } from './add-to-calendar-button';

vi.mock('@/lib/calendar/download-booking-ics', () => ({
  downloadBookingIcs: vi.fn(),
}));

const bookingFixture = {
  id: 'booking-1',
  status: 'confirmed' as const,
  service: { name: '按摩服務' },
  slot: {
    startAt: '2026-05-22T10:00:00.000Z',
    endAt: '2026-05-22T11:00:00.000Z',
  },
  note: '備註',
};

describe('AddToCalendarButton', () => {
  beforeEach(() => {
    vi.mocked(downloadBookingIcs).mockClear();
  });

  it('點擊時呼叫 downloadBookingIcs', async () => {
    const user = userEvent.setup();

    render(<AddToCalendarButton booking={bookingFixture} />);

    await user.click(screen.getByRole('button', { name: '加入日曆' }));

    expect(downloadBookingIcs).toHaveBeenCalledWith({
      id: bookingFixture.id,
      service: bookingFixture.service,
      slot: bookingFixture.slot,
      note: bookingFixture.note,
    });
  });

  it('cancelled 狀態不渲染按鈕', () => {
    render(<AddToCalendarButton booking={{ ...bookingFixture, status: 'cancelled' }} />);

    expect(screen.queryByRole('button', { name: '加入日曆' })).not.toBeInTheDocument();
  });
});
