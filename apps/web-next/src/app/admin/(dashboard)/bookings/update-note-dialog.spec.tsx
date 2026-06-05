import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpdateNoteDialog } from './update-note-dialog';
import * as adminApi from '@/lib/admin/admin-api';

vi.mock('@/lib/admin/admin-api');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockBooking: any = {
  id: 'b1',
  note: '舊備註',
};

describe('UpdateNoteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('應顯示現有備註並允許修改', async () => {
    vi.mocked(adminApi.updateAdminBooking).mockResolvedValue({ data: {} } as any);
    const onOpenChange = vi.fn();

    render(<UpdateNoteDialog booking={mockBooking} open={true} onOpenChange={onOpenChange} />);

    const textarea = screen.getByPlaceholderText(/請輸入預約相關備註/i);
    expect(textarea).toHaveValue('舊備註');

    fireEvent.change(textarea, { target: { value: '新備註' } });
    fireEvent.click(screen.getByRole('button', { name: /確認更新/i }));

    await waitFor(() => {
      expect(adminApi.updateAdminBooking).toHaveBeenCalledWith('b1', { note: '新備註' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
