import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/msw/server';
import { RegisterForm } from './register-form';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    refresh: vi.fn(),
  }),
}));

describe('RegisterForm', () => {
  beforeEach(() => {
    push.mockClear();
  });

  // 成功註冊後應導向登入頁，且不顯示 form-error。
  it('填表送出成功後不顯示錯誤訊息', async () => {
    const user = userEvent.setup();

    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('顯示名稱'), '測試使用者');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '註冊' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/login');
    });

    expect(screen.queryByText('此 email 已被使用。')).not.toBeInTheDocument();
    expect(screen.queryByText('系統暫時無法處理請求。')).not.toBeInTheDocument();
  });

  // EMAIL_ALREADY_USED 應顯示穩定註冊錯誤文案。
  it('送出後 MSW 回 EMAIL_ALREADY_USED 時顯示對應錯誤文字', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', () => {
        return HttpResponse.json(
          {
            error: {
              code: 'EMAIL_ALREADY_USED',
              message: 'email 已被使用',
            },
          },
          { status: 409 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'duplicate@example.com');
    await user.type(screen.getByLabelText('顯示名稱'), '重複使用者');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '註冊' }));

    expect(await screen.findByText('此 email 已被使用。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
