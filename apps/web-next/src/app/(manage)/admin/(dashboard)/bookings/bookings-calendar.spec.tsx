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
    status: 'cancelled',
    note: '已取消預約',
    cancelledAt: '2026-05-02T00:00:00Z',
    cancelledBy: 'user',
    cancelReason: '不要了',
    user: { id: 'u2', email: 'u2@ex.com', displayName: 'User 2' },
    service: { id: 's1', name: 'Service A' },
    slot: { id: 'sl1', startAt: '2026-06-15T14:00:00Z', endAt: '2026-06-15T15:00:00Z' },
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'b3',
    status: 'pending' as any,
    note: '待確認預約',
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    user: { id: 'u3', email: 'u3@ex.com', displayName: 'User 3' },
    service: { id: 's1', name: 'Service A' },
    slot: { id: 'sl1', startAt: '2026-06-15T12:00:00Z', endAt: '2026-06-15T13:00:00Z' },
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

  it('預約列表應包含「一般」與「已取消」分頁，且預設顯示一般', () => {
    render(<BookingsCalendar initialBookings={sampleBookings} month="2026-06" />);
    
    // 預設應該在「一般」分頁
    expect(screen.getByRole('button', { name: '一般' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已取消' })).toBeInTheDocument();
    
    // 選中 15 號
    const day15 = screen.getAllByText('15').find(el => el.closest('table'));
    // 一般分頁應看到 confirmed，不應看到 cancelled
    expect(screen.getByText(/User 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/User 2/i)).not.toBeInTheDocument();
  });

  it('在「一般」分頁中，應顯示除了已取消（cancelled）以外的所有預約單（如 pending 等非取消狀態）', () => {
    render(<BookingsCalendar initialBookings={sampleBookings} month="2026-06" />);
    
    // 一般分頁應看到 confirmed (User 1) 與 pending (User 3)
    expect(screen.getByText(/User 1/i)).toBeInTheDocument();
    expect(screen.getByText(/User 3/i)).toBeInTheDocument();
    expect(screen.queryByText(/User 2/i)).not.toBeInTheDocument();
  });

  it('切換至「已取消」分頁時應顯示已取消預約', async () => {
    render(<BookingsCalendar initialBookings={sampleBookings} month="2026-06" />);
    
    const cancelledTab = screen.getByRole('button', { name: '已取消' });
    fireEvent.click(cancelledTab);

    // 已取消分頁應看到 User 2 (cancelled)，不應看到 User 1 (confirmed)
    expect(screen.getByText(/User 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/User 1/i)).not.toBeInTheDocument();
  });

  it('切換月份時應呼叫 router.push 更新 URL', () => {
    render(<BookingsCalendar initialBookings={sampleBookings} month="2026-06" />);
    
    // 點擊「下個月」按鈕
    const nextButton = screen.getByRole('button', { name: /Go to the Next Month/i });
    fireEvent.click(nextButton);
    
    expect(push).toHaveBeenCalledWith(expect.stringContaining('month=2026-07'));
  });
});
