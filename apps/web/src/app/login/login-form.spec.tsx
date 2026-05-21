import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/msw/server';
import { LoginForm } from './login-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  // INVALID_CREDENTIALS 應顯示登入專用錯誤文案。
  it('INVALID_CREDENTIALS 時顯示錯誤訊息', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/login', () => {
        return HttpResponse.json(
          {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: '帳號或密碼錯誤。',
            },
          },
          { status: 401 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<LoginForm redirectTo="/my/bookings" />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('密碼'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('帳號或密碼錯誤。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // 登入成功後應導向 redirect 目標且不顯示 form-error。
  it('成功登入後不顯示錯誤訊息', async () => {
    const user = userEvent.setup();

    render(<LoginForm redirectTo="/my/bookings" />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '登入' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/my/bookings');
    });

    expect(screen.queryByText('帳號或密碼錯誤。')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });
});
