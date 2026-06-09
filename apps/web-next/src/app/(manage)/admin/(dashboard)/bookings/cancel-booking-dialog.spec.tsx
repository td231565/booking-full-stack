import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CancelBookingDialog } from './cancel-booking-dialog';
import * as adminApi from '@/lib/admin/admin-api';

vi.mock('@/lib/admin/admin-api');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('CancelBookingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('輸入原因並提交後應呼叫 cancelAdminBooking', async () => {
    vi.mocked(adminApi.cancelAdminBooking).mockResolvedValue({ data: {} } as any);
    const onOpenChange = vi.fn();

    render(<CancelBookingDialog bookingId="b1" open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByLabelText(/取消原因/i);
    fireEvent.change(input, { target: { value: '客戶要求' } });
    
    fireEvent.click(screen.getByRole('button', { name: /確認取消預約/i }));

    await waitFor(() => {
      expect(adminApi.cancelAdminBooking).toHaveBeenCalledWith('b1', { reason: '客戶要求' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
