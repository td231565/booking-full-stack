'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
    <div className="slot-list">
      {bookings.map((booking) => (
        <article className="slot" key={booking.id}>
          <div>
            <strong>{booking.service.name}</strong>
            <p>
              {formatDateTime(booking.slot.startAt)} · {formatStatus(booking.status)}
            </p>
          </div>
          <Link className="button-link" href={`/my/bookings/${booking.id}`}>
            查看
          </Link>
        </article>
      ))}
    </div>
  );
}

// 格式化預約時間，讓列表以台灣常見日期時間呈現。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

// 將 API 狀態值轉為畫面顯示文字。
function formatStatus(status: BookingSummary['status']): string {
  if (status === 'cancelled') {
    return '已取消';
  }

  if (status === 'completed') {
    return '已完成';
  }

  return '已成立';
}
