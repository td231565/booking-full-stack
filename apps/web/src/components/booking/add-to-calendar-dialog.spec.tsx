import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { downloadBookingIcs } from '@/lib/calendar/download-booking-ics';
import { AddToCalendarDialog } from './add-to-calendar-dialog';

vi.mock('@/lib/calendar/download-booking-ics', () => ({
  downloadBookingIcs: vi.fn(),
}));

const bookingFixture = {
  id: 'booking-1',
  service: { name: '按摩服務' },
  slot: {
    startAt: '2026-05-22T10:00:00.000Z',
    endAt: '2026-05-22T11:00:00.000Z',
  },
  note: null,
};

describe('AddToCalendarDialog', () => {
  beforeEach(() => {
    vi.mocked(downloadBookingIcs).mockClear();
  });

  it('開啟時顯示中性說明文案', () => {
    render(<AddToCalendarDialog booking={bookingFixture} onOpenChange={vi.fn()} open />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('是否加入日曆？')).toBeInTheDocument();
    expect(screen.getByText('下載行程檔後，請以裝置上的日曆 App 開啟並加入。')).toBeInTheDocument();
  });

  it('點擊加入時觸發下載並關閉', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<AddToCalendarDialog booking={bookingFixture} onOpenChange={onOpenChange} open />);

    await user.click(screen.getByRole('button', { name: '加入' }));

    expect(downloadBookingIcs).toHaveBeenCalledWith(bookingFixture);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('點擊稍後時關閉 Dialog', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<AddToCalendarDialog booking={bookingFixture} onOpenChange={onOpenChange} open />);

    await user.click(screen.getByRole('button', { name: '稍後' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(downloadBookingIcs).not.toHaveBeenCalled();
  });
});
