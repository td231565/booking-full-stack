import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../test/msw/server';
import { AdminLoginForm } from './admin-login-form';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: '管理員',
  role: 'admin' as const,
  status: 'active' as const,
};

describe('AdminLoginForm', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  // 成功登入應只呼叫後台 auth 端點並導向預約管理。
  it('成功登入後呼叫 POST /api/admin/auth/login 並導向 /admin/bookings', async () => {
    const requestedUrls: string[] = [];

    server.use(
      http.post('http://127.0.0.1:3001/api/admin/auth/login', ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: adminUser });
      }),
      http.post('http://127.0.0.1:3001/api/auth/login', ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: adminUser });
      }),
    );

    const user = userEvent.setup();

    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '登入後台' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/admin/bookings');
    });

    expect(requestedUrls).toEqual(['/api/admin/auth/login']);
    expect(refresh).toHaveBeenCalled();
  });

  // 非 admin 403 應顯示無權限，且不應以 member logout 補救。
  it('FORBIDDEN 時顯示無權限訊息且不呼叫 logout', async () => {
    const requestedUrls: string[] = [];

    server.use(
      http.post('http://127.0.0.1:3001/api/admin/auth/login', ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname);
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: '權限不足' } },
          { status: 403 },
        );
      }),
      http.post('http://127.0.0.1:3001/api/auth/logout', ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: {} });
      }),
      http.post('http://127.0.0.1:3001/api/admin/auth/logout', ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: {} });
      }),
    );

    const user = userEvent.setup();

    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '登入後台' }));

    expect(await screen.findByText('此帳號無後台管理權限。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(requestedUrls).toEqual(['/api/admin/auth/login']);
  });
});
