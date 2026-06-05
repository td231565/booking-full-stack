import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditBookingDialog } from './edit-booking-dialog';
import * as adminApi from '@/lib/admin/admin-api';
import { SWRConfig } from 'swr';
import React from 'react';

vi.mock('@/lib/admin/admin-api');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockBooking: any = {
  id: 'b1',
  service: { id: 's1', name: '洗車' },
  slot: { id: 'sl-current', startAt: '2026-06-01T10:00:00Z' }
};

describe('EditBookingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );

  it('應顯示目前時段並允許選取新時段改期', async () => {
    vi.mocked(adminApi.getAdminAvailableSlots).mockResolvedValue({
      data: [
        { id: 'sl-current', startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-01T11:00:00Z', status: 'available' },
        { id: 'sl2', startAt: '2026-06-01T14:00:00Z', endAt: '2026-06-01T15:00:00Z', status: 'available' }
      ]
    } as any);
    vi.mocked(adminApi.updateAdminBooking).mockResolvedValue({ data: {} } as any);

    const onOpenChange = vi.fn();
    render(
      <TestWrapper>
        <EditBookingDialog booking={mockBooking} open={true} onOpenChange={onOpenChange} />
      </TestWrapper>
    );

    // 點擊新時段 (sl2)
    // 尋找文字包含 06/01 22:00 的按鈕
    const newSlotBtn = await screen.findByText(/22:00/i);
    fireEvent.click(newSlotBtn);
    
    const submitBtn = screen.getByRole('button', { name: /確認改期/i });
    
    // 等待按鈕啟用，這代表狀態已更新
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    }, { timeout: 2000 });
    
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(adminApi.updateAdminBooking).toHaveBeenCalledWith('b1', { availabilitySlotId: 'sl2' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
