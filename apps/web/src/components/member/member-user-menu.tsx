'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MemberLogoutMenuItem } from '@/components/member/member-logout-menu-item';
import type { CurrentUser } from '@/lib/auth/get-current-user';

type MemberUserMenuProps = {
  user: CurrentUser;
};

// 依顯示名稱產生 Avatar 縮寫，無名稱時退回問號避免空白圓圈。
function getAvatarFallback(displayName: string): string {
  const trimmed = displayName.trim();

  return trimmed ? trimmed[0].toUpperCase() : '?';
}

// 顯示會員 Avatar、名稱與 hover 展開的下拉選單（含登出）。
export function MemberUserMenu({ user }: MemberUserMenuProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-ink outline-none hover:bg-surface data-popup-open:bg-surface"
        closeDelay={120}
        delay={0}
        openOnHover
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-accent-soft text-xs font-semibold text-accent">
            {getAvatarFallback(user.displayName)}
          </AvatarFallback>
        </Avatar>
        <span className="max-w-[10rem] truncate">{user.displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32" sideOffset={6}>
        <MemberLogoutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
