import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
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
          { error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤。' } },
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

  // 送出期間按鈕應 disabled 並顯示「登入中...」，防止重複送出。
  it('送出期間按鈕顯示「登入中...」且 disabled', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/login', async () => {
        await delay(200);
        return HttpResponse.json({ data: { id: 'user-1' } });
      }),
    );

    const user = userEvent.setup();

    render(<LoginForm redirectTo="/my/bookings" />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '登入' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登入中...' })).toBeDisabled();
    });
  });

  // USER_DISABLED 應顯示帳號停用提示，與密碼錯誤訊息區分。
  it('USER_DISABLED 時顯示帳號停用訊息', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/login', () => {
        return HttpResponse.json(
          { error: { code: 'USER_DISABLED', message: '帳號已停用' } },
          { status: 403 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<LoginForm redirectTo="/my/bookings" />);

    await user.type(screen.getByLabelText('Email'), 'disabled@example.com');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('此帳號已停用。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  // RATE_LIMITED 的登入專用文案與全域 RATE_LIMITED 文案不同。
  it('RATE_LIMITED 時顯示登入太頻繁訊息', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/login', () => {
        return HttpResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'too many requests' } },
          { status: 429 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<LoginForm redirectTo="/my/bookings" />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('登入太頻繁，請稍後再試。')).toBeInTheDocument();
  });

  // 網路層失敗應走 catch fallback，不顯示業務錯誤碼。
  it('網路錯誤時顯示系統暫時無法處理請求', async () => {
    server.use(http.post('http://127.0.0.1:3001/api/auth/login', () => HttpResponse.error()));

    const user = userEvent.setup();

    render(<LoginForm redirectTo="/my/bookings" />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '登入' }));

    expect(await screen.findByText('系統暫時無法處理請求。')).toBeInTheDocument();
  });
});
