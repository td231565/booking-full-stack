'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddToCalendarButton } from '@/components/booking/add-to-calendar-button';
import { BookingStatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { ListRow, ListStack } from '@/components/ui/list-row';
import { Panel } from '@/components/ui/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/status-state';
import { ApiClientError } from '@/lib/api/client';
import { BookingSummary, getMyBookings } from '@/lib/bookings/member-bookings';

// 顯示目前登入會員自己的預約列表，未登入時導向登入頁。
export function BookingsList() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // 從會員 API 載入私人預約資料，避免 Server Component 共享快取。
    async function loadBookings() {
      try {
        const response = await getMyBookings();

        if (isMounted) {
          setBookings(response.data);
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') {
          router.push('/login?redirect=/my/bookings');
          return;
        }

        if (isMounted) {
          setErrorMessage(error instanceof ApiClientError ? error.message : '請稍後再試。');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBookings();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (isLoading) {
    return <LoadingState title="正在載入預約" description="請稍候。" />;
  }

  if (errorMessage) {
    return <ErrorState title="預約資料暫時無法載入" description={errorMessage} />;
  }

  if (bookings.length === 0) {
    return <EmptyState title="尚無預約" description="可先到服務列表選擇可預約時段。" />;
  }

  return (
    <Panel>
      <ListStack>
        {bookings.map((booking) => (
          <ListRow
            actions={
              <div className="flex flex-wrap gap-2">
                <AddToCalendarButton
                  booking={{
                    id: booking.id,
                    status: booking.status,
                    service: { name: booking.service.name },
                    slot: booking.slot,
                    note: null,
                  }}
                />
                <ButtonLink href={`/my/bookings/${booking.id}`} variant="secondary">
                  查看
                </ButtonLink>
              </div>
            }
            key={booking.id}
          >
            <p className="font-semibold text-ink">{booking.service.name}</p>
            <p className="mt-1 text-sm text-ink-muted">{formatDateTime(booking.slot.startAt)}</p>
            <div className="mt-2">
              <BookingStatusBadge status={booking.status} />
            </div>
          </ListRow>
        ))}
      </ListStack>
    </Panel>
  );
}

// 格式化預約時間，讓列表以台灣常見日期時間呈現。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
