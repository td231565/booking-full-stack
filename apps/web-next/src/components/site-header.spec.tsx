import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '@/components/site-header';
import { server } from '../../test/msw/server';

const API_BASE_URL = 'http://127.0.0.1:3001';

vi.mock('next/navigation', () => ({
  usePathname: () => '/services',
}));

// 每個測試使用獨立 SWR cache，避免前一個案例的登入狀態殘留。
function renderSiteHeader() {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SiteHeader />
    </SWRConfig>,
  );
}

describe('SiteHeader', () => {
  // 未登入時顯示登入連結，不顯示會員選單。
  it('未登入時顯示登入連結', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/auth/me`, () => {
        return HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: '請先登入' } }, { status: 401 });
      }),
    );

    renderSiteHeader();

    expect(await screen.findByRole('link', { name: '登入' })).toBeInTheDocument();
    expect(screen.queryByText('測試會員')).not.toBeInTheDocument();
  });

  // 已登入時顯示名稱與 Avatar，並隱藏登入連結。
  it('已登入時顯示會員名稱並隱藏登入連結', async () => {
    server.use(
      http.get(`${API_BASE_URL}/api/auth/me`, () => {
        return HttpResponse.json({
          data: {
            id: 'user-1',
            email: 'member@example.com',
            displayName: '測試會員',
            role: 'user',
            status: 'active',
          },
        });
      }),
    );

    renderSiteHeader();

    await waitFor(() => {
      expect(screen.getByText('測試會員')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: '登入' })).not.toBeInTheDocument();
  });
});
