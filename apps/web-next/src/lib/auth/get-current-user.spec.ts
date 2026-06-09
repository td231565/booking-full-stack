import { http, HttpResponse } from 'msw';
import { server } from '../../../test/msw/server';
import { getCurrentAdminUser, getCurrentMemberUser } from './get-current-user';

const memberUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: '會員',
  role: 'user' as const,
  status: 'active' as const,
};

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: '管理員',
  role: 'admin' as const,
  status: 'active' as const,
};

describe('getCurrentUser audience', () => {
  // member audience 應查詢會員 me 端點。
  it('getCurrentMemberUser 請求 /api/auth/me', async () => {
    const requestedPaths: string[] = [];

    server.use(
      http.get('http://127.0.0.1:3001/api/auth/me', ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: memberUser });
      }),
      http.get('http://127.0.0.1:3001/api/admin/auth/me', ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: adminUser });
      }),
    );

    const user = await getCurrentMemberUser();

    expect(requestedPaths).toEqual(['/api/auth/me']);
    expect(user).toEqual(memberUser);
  });

  // admin audience 應查詢後台 me 端點。
  it('getCurrentAdminUser 請求 /api/admin/auth/me', async () => {
    const requestedPaths: string[] = [];

    server.use(
      http.get('http://127.0.0.1:3001/api/auth/me', ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: memberUser });
      }),
      http.get('http://127.0.0.1:3001/api/admin/auth/me', ({ request }) => {
        requestedPaths.push(new URL(request.url).pathname);
        return HttpResponse.json({ data: adminUser });
      }),
    );

    const user = await getCurrentAdminUser();

    expect(requestedPaths).toEqual(['/api/admin/auth/me']);
    expect(user).toEqual(adminUser);
  });
});
