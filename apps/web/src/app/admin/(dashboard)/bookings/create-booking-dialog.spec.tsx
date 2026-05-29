import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateBookingDialog } from './create-booking-dialog';
import * as adminApi from '@/lib/admin/admin-api';
import { SWRConfig } from 'swr';
import React from 'react';

vi.mock('@/lib/admin/admin-api');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('CreateBookingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );

  it('輸入 Email 並查詢後應顯示會員名稱', async () => {
    vi.mocked(adminApi.lookupAdminUserByEmail).mockResolvedValue({
      data: { id: 'u1', email: 'test@ex.com', displayName: '測試用戶' }
    } as any);

    render(
      <TestWrapper>
        <CreateBookingDialog open={true} onOpenChange={() => {}} />
      </TestWrapper>
    );
    
    const emailInput = screen.getByLabelText(/會員 Email/i);
    fireEvent.change(emailInput, { target: { value: 'test@ex.com' } });
    fireEvent.click(screen.getByRole('button', { name: /查詢/i }));

    await waitFor(() => {
      expect(screen.getByText(/測試用戶/i)).toBeInTheDocument();
    });
  });

  it('提交成功時應呼叫 createAdminBooking 並關閉視窗', async () => {
    vi.mocked(adminApi.lookupAdminUserByEmail).mockResolvedValue({
      data: { id: 'u1', email: 'test@ex.com', displayName: '測試用戶' }
    } as any);
    vi.mocked(adminApi.getAdminServices).mockResolvedValue({
      data: [{ id: 's1', name: '洗車', price: 500 }]
    } as any);
    vi.mocked(adminApi.getAdminAvailableSlots).mockResolvedValue({
      data: [{ id: 'sl1', startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-01T11:00:00Z', status: 'available' }]
    } as any);
    vi.mocked(adminApi.createAdminBooking).mockResolvedValue({ data: {} } as any);

    const onOpenChange = vi.fn();
    render(
      <TestWrapper>
        <CreateBookingDialog open={true} onOpenChange={onOpenChange} />
      </TestWrapper>
    );

    // 模擬查詢與選取
    fireEvent.change(screen.getByLabelText(/會員 Email/i), { target: { value: 'test@ex.com' } });
    fireEvent.click(screen.getByRole('button', { name: /查詢/i }));
    
    // 等待服務加載並選擇服務
    const serviceSelect = await screen.findByRole('combobox', { name: /選擇服務/i });
    
    await waitFor(() => {
      expect(screen.queryByText(/洗車/i)).toBeInTheDocument();
    });
    fireEvent.change(serviceSelect, { target: { value: 's1' } });

    // 等待時段加載並選擇時段
    const slotBtn = await screen.findByText(/06\/01/i);
    fireEvent.click(slotBtn);
    
    // 確認按鈕不再是 disabled
    const submitBtn = screen.getByRole('button', { name: /確認建立/i });
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(adminApi.createAdminBooking).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
