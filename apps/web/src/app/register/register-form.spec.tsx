import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
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

  // 送出期間按鈕應 disabled 並顯示「註冊中...」，防止重複送出。
  it('送出期間按鈕顯示「註冊中...」且 disabled', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', async () => {
        await delay(200);
        return HttpResponse.json({ data: { id: 'user-1' } });
      }),
    );

    const user = userEvent.setup();

    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('顯示名稱'), '測試使用者');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '註冊' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '註冊中...' })).toBeDisabled();
    });
  });

  // EMAIL_ALREADY_USED 應顯示穩定註冊錯誤文案。
  it('送出後 MSW 回 EMAIL_ALREADY_USED 時顯示對應錯誤文字', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', () => {
        return HttpResponse.json(
          { error: { code: 'EMAIL_ALREADY_USED', message: 'email 已被使用' } },
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

  // VALIDATION_ERROR 對應格式提示，讓使用者知道輸入規則。
  it('MSW 回 VALIDATION_ERROR 時顯示格式錯誤提示', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', () => {
        return HttpResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: '格式不符' } },
          { status: 422 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'bad@example.com');
    await user.type(screen.getByLabelText('顯示名稱'), 'test');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '註冊' }));

    expect(await screen.findByText('請確認 email、顯示名稱與密碼格式。')).toBeInTheDocument();
  });

  // RATE_LIMITED 走 getApiErrorMessage 的通用 RATE_LIMITED 路徑。
  it('MSW 回 RATE_LIMITED 時顯示操作太頻繁', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', () => {
        return HttpResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'too many requests' } },
          { status: 429 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('顯示名稱'), '測試使用者');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '註冊' }));

    expect(await screen.findByText('操作太頻繁，請稍後再試。')).toBeInTheDocument();
  });

  // 網路層失敗（非 ApiClientError）應走 catch fallback。
  it('網路錯誤時顯示系統暫時無法處理請求', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', () => HttpResponse.error()),
    );

    const user = userEvent.setup();

    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.type(screen.getByLabelText('顯示名稱'), '測試使用者');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '註冊' }));

    expect(await screen.findByText('系統暫時無法處理請求。')).toBeInTheDocument();
  });

  // 再次送出前應清除前一次的錯誤訊息（handleSubmit 開頭 setErrorMessage(null)）。
  it('再次送出時清除前一次錯誤訊息', async () => {
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', () => {
        return HttpResponse.json(
          { error: { code: 'EMAIL_ALREADY_USED', message: 'email 已被使用' } },
          { status: 409 },
        );
      }),
    );

    const user = userEvent.setup();

    render(<RegisterForm />);

    await user.type(screen.getByLabelText('Email'), 'dup@example.com');
    await user.type(screen.getByLabelText('顯示名稱'), '測試');
    await user.type(screen.getByLabelText('密碼'), 'password123');
    await user.click(screen.getByRole('button', { name: '註冊' }));

    expect(await screen.findByText('此 email 已被使用。')).toBeInTheDocument();

    // 第二次送出改為成功回應，確認錯誤訊息被清除。
    server.use(
      http.post('http://127.0.0.1:3001/api/auth/register', () => {
        return HttpResponse.json({ data: { id: 'user-1' } });
      }),
    );

    await user.click(screen.getByRole('button', { name: '註冊' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/login');
    });

    expect(screen.queryByText('此 email 已被使用。')).not.toBeInTheDocument();
  });
});
