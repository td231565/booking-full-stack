import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { faker } from '@faker-js/faker';
import * as argon2 from 'argon2';
import { ApiException } from '../../common/api-exception';
import { AuthRepository, PublicUserRecord } from './auth.repository';
import { AuthService } from './auth.service';

// 建立測試用公開使用者資料，避免每個案例重複組裝欄位。
function buildPublicUser(overrides: Partial<PublicUserRecord> = {}): PublicUserRecord {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email().toLowerCase(),
    displayName: faker.person.fullName(),
    role: 'user',
    status: 'active',
    ...overrides,
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let authRepository: {
    createUser: ReturnType<typeof vi.fn>;
    findUserWithPasswordByEmail: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
    findUserByActiveSessionHash: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authRepository = {
      createUser: vi.fn(),
      findUserWithPasswordByEmail: vi.fn(),
      createSession: vi.fn(),
      findUserByActiveSessionHash: vi.fn(),
      revokeSession: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthRepository,
          useValue: authRepository,
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  // register：重複 email 應轉成穩定業務錯誤碼，避免落到 500。
  it('register 在 email 重複時拋出 EMAIL_ALREADY_USED', async () => {
    authRepository.createUser.mockRejectedValue({ code: '23505' });

    await expect(authService.register('user@example.com', 'password123', '測試使用者')).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_USED',
    });
  });

  // register：非 unique 錯誤應原樣拋出，不可誤轉成 EMAIL_ALREADY_USED。
  it('register 在非 unique 錯誤時原樣拋出', async () => {
    const dbError = new Error('connection failed');

    authRepository.createUser.mockRejectedValue(dbError);

    await expect(authService.register('user@example.com', 'password123', '測試使用者')).rejects.toBe(dbError);
  });

  // register：密碼必須以 argon2id 雜湊後才寫入 repository，不可保存明文。
  it('register 會以 argon2id 雜湊密碼後才寫入 repository', async () => {
    const password = 'password123';
    const createdUser = buildPublicUser();

    authRepository.createUser.mockImplementation(async (_email: string, passwordHash: string) => {
      expect(passwordHash).not.toBe(password);
      expect(await argon2.verify(passwordHash, password)).toBe(true);

      return createdUser;
    });

    await expect(authService.register(createdUser.email, password, createdUser.displayName)).resolves.toEqual(createdUser);
  });

  // register：email 與 displayName 需正規化後才寫入 repository。
  it('register 會正規化 email 與 displayName 後寫入 repository', async () => {
    const createdUser = buildPublicUser();

    authRepository.createUser.mockResolvedValue(createdUser);

    await authService.register('  User@Example.COM  ', 'password123', '  測試使用者  ');

    expect(authRepository.createUser).toHaveBeenCalledWith('user@example.com', expect.any(String), '測試使用者');
  });

  // login：密碼錯誤時回傳 INVALID_CREDENTIALS，避免洩漏帳號是否存在。
  it('login 在密碼錯誤時拋出 INVALID_CREDENTIALS', async () => {
    const passwordHash = await argon2.hash('correct-password', { type: argon2.argon2id });

    authRepository.findUserWithPasswordByEmail.mockResolvedValue({
      ...buildPublicUser(),
      passwordHash,
    });

    await expect(authService.login('user@example.com', 'wrong-password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  // login：帳號不存在時同樣回 INVALID_CREDENTIALS，避免帳號枚舉。
  it('login 在帳號不存在時拋出 INVALID_CREDENTIALS', async () => {
    authRepository.findUserWithPasswordByEmail.mockResolvedValue(null);

    await expect(authService.login('missing@example.com', 'password123')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  // login：停用帳號不可登入。
  it('login 在帳號停用時拋出 USER_DISABLED', async () => {
    const passwordHash = await argon2.hash('password123', { type: argon2.argon2id });

    authRepository.findUserWithPasswordByEmail.mockResolvedValue({
      ...buildPublicUser({ status: 'disabled' }),
      passwordHash,
    });

    await expect(authService.login('user@example.com', 'password123')).rejects.toMatchObject({
      code: 'USER_DISABLED',
    });
  });

  // login：成功時建立 session 且不回傳 passwordHash。
  it('login 成功時建立 session 並回傳公開使用者資料', async () => {
    const password = 'password123';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = buildPublicUser();

    authRepository.findUserWithPasswordByEmail.mockResolvedValue({
      ...user,
      passwordHash,
    });
    authRepository.createSession.mockResolvedValue(undefined);

    const result = await authService.login(`  ${user.email.toUpperCase()}  `, password);

    expect(result.user).toEqual(user);
    expect(result.sessionToken).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(authRepository.createSession).toHaveBeenCalledWith(
      user.id,
      createHash('sha256').update(result.sessionToken).digest('hex'),
      result.expiresAt,
    );
  });

  // getCurrentUser：無效或未提供 token 時視為未登入。
  it('getCurrentUser 在無效 token 時拋出 UNAUTHENTICATED', async () => {
    await expect(authService.getCurrentUser(undefined)).rejects.toBeInstanceOf(ApiException);
    await expect(authService.getCurrentUser(undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });

    authRepository.findUserByActiveSessionHash.mockResolvedValue(null);

    await expect(authService.getCurrentUser('invalid-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  // getCurrentUser：停用帳號即使有有效 session 也視為未登入。
  it('getCurrentUser 在帳號停用時拋出 UNAUTHENTICATED', async () => {
    authRepository.findUserByActiveSessionHash.mockResolvedValue(buildPublicUser({ status: 'disabled' }));

    await expect(authService.getCurrentUser('valid-token')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  // getCurrentUser：有效 token 時回傳目前登入者。
  it('getCurrentUser 在有效 token 時回傳目前登入者', async () => {
    const user = buildPublicUser();

    authRepository.findUserByActiveSessionHash.mockResolvedValue(user);

    await expect(authService.getCurrentUser('valid-token')).resolves.toEqual(user);
  });

  // logout：有 token 時撤銷 session。
  it('logout 在有 token 時撤銷 session', async () => {
    const sessionToken = 'session-token';

    await authService.logout(sessionToken);

    expect(authRepository.revokeSession).toHaveBeenCalledWith(
      createHash('sha256').update(sessionToken).digest('hex'),
    );
  });

  // logout：無 token 時維持冪等且不呼叫 repository。
  it('logout 在無 token 時不呼叫 revokeSession', async () => {
    await authService.logout(undefined);

    expect(authRepository.revokeSession).not.toHaveBeenCalled();
  });

  // SVC-01：會員 cookie 名稱。
  it('getSessionCookieName(member) 回傳 booking_member_session', () => {
    expect(authService.getSessionCookieName('member')).toBe('booking_member_session');
  });

  // SVC-02：後台 cookie 名稱。
  it('getSessionCookieName(admin) 回傳 booking_admin_session', () => {
    expect(authService.getSessionCookieName('admin')).toBe('booking_admin_session');
  });

  // SVC-03：明確以 member audience 登入時仍建立 session。
  it('login 以 member audience 成功時建立 session', async () => {
    const password = 'password123';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = buildPublicUser();

    authRepository.findUserWithPasswordByEmail.mockResolvedValue({
      ...user,
      passwordHash,
    });
    authRepository.createSession.mockResolvedValue(undefined);

    const result = await authService.login(user.email, password, 'member');

    expect(result.user).toEqual(user);
    expect(authRepository.createSession).toHaveBeenCalledWith(
      user.id,
      createHash('sha256').update(result.sessionToken).digest('hex'),
      result.expiresAt,
    );
  });

  // SVC-04：後台登入僅允許 admin 角色。
  it('loginAsAdmin 在 role=user 時拋出 FORBIDDEN', async () => {
    const password = 'password123';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    authRepository.findUserWithPasswordByEmail.mockResolvedValue({
      ...buildPublicUser({ role: 'user' }),
      passwordHash,
    });

    await expect(authService.loginAsAdmin('user@example.com', password)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });

  // SVC-04：login 以 admin audience 同樣拒絕一般會員。
  it('login 以 admin audience 在 role=user 時拋出 FORBIDDEN', async () => {
    const password = 'password123';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    authRepository.findUserWithPasswordByEmail.mockResolvedValue({
      ...buildPublicUser({ role: 'user' }),
      passwordHash,
    });

    await expect(authService.login('user@example.com', password, 'admin')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(authRepository.createSession).not.toHaveBeenCalled();
  });

  // SVC-05：admin 帳號可建立後台 session。
  it('loginAsAdmin 在 role=admin 時建立 session', async () => {
    const password = 'password123';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = buildPublicUser({ role: 'admin' });

    authRepository.findUserWithPasswordByEmail.mockResolvedValue({
      ...user,
      passwordHash,
    });
    authRepository.createSession.mockResolvedValue(undefined);

    const result = await authService.loginAsAdmin(user.email, password);

    expect(result.user).toEqual(user);
    expect(result.sessionToken).toBeTruthy();
    expect(authRepository.createSession).toHaveBeenCalled();
  });

  // SVC-06：member audience 下有效 token 回傳使用者。
  it('getCurrentUser 在 member audience 與有效 token 時回傳目前登入者', async () => {
    const user = buildPublicUser();

    authRepository.findUserByActiveSessionHash.mockResolvedValue(user);

    await expect(authService.getCurrentUser('valid-token', 'member')).resolves.toEqual(user);
  });

  // SVC-07：admin audience 下無 token 仍視為未登入。
  it('getCurrentUser 在 admin audience 且無 token 時拋出 UNAUTHENTICATED', async () => {
    await expect(authService.getCurrentUser(undefined, 'admin')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  // SVC-08：member audience 登出只撤銷對應 token hash。
  it('logout 在 member audience 時撤銷對應 session hash', async () => {
    const sessionToken = 'member-session-token';

    await authService.logout(sessionToken, 'member');

    expect(authRepository.revokeSession).toHaveBeenCalledWith(
      createHash('sha256').update(sessionToken).digest('hex'),
    );
  });
});
