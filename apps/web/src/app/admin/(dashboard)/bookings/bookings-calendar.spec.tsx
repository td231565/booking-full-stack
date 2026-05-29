import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookingsCalendar } from './bookings-calendar';
import { AdminBooking } from '@/lib/admin/admin-api';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

const sampleBookings: AdminBooking[] = [
  {
    id: 'b1',
    status: 'confirmed',
    note: '預約 1',
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    user: { id: 'u1', email: 'u1@ex.com', displayName: 'User 1' },
    service: { id: 's1', name: 'Service A' },
    slot: { id: 'sl1', startAt: '2026-06-15T10:00:00Z', endAt: '2026-06-15T11:00:00Z' },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'b2',
    status: 'confirmed',
    note: '預約 2',
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    user: { id: 'u2', email: 'u2@ex.com', displayName: 'User 2' },
    service: { id: 's1', name: 'Service A' },
    slot: { id: 'sl2', startAt: '2026-06-16T10:00:00Z', endAt: '2026-06-16T11:00:00Z' },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
];

describe('BookingsCalendar', () => {
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push });
    (usePathname as any).mockReturnValue('/admin/bookings');
    (useSearchParams as any).mockReturnValue(new URLSearchParams('month=2026-06'));
  });

  it('應渲染日曆與「新增預約」按鈕', () => {
    render(<BookingsCalendar initialBookings={sampleBookings} month="2026-06" />);
    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新增預約/i })).toBeInTheDocument();
  });

  it('選中特定日期時應顯示該日的預約列表', () => {
    render(<BookingsCalendar initialBookings={sampleBookings} month="2026-06" />);
    
    // 尋找文字為 15 的日曆單元格並點擊
    const day15 = screen.getAllByText('15').find(el => el.closest('table'));
    if (day15) {
      fireEvent.click(day15);
    }
    
    expect(screen.getByText(/User 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/User 2/i)).not.toBeInTheDocument();
  });

  it('切換月份時應呼叫 router.push 更新 URL', () => {
    render(<BookingsCalendar initialBookings={sampleBookings} month="2026-06" />);
    
    // 點擊「下個月」按鈕
    const nextButton = screen.getByRole('button', { name: /Go to the Next Month/i });
    fireEvent.click(nextButton);
    
    expect(push).toHaveBeenCalledWith(expect.stringContaining('month=2026-07'));
  });
});
