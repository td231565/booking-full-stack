'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookingStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormError, FormField, TextInput } from '@/components/ui/form';
import { Notice } from '@/components/ui/notice';
import { Panel } from '@/components/ui/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/status-state';
import { ApiClientError } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/error-messages';
import { BookingDetail, cancelMyBooking, getMyBooking } from '@/lib/bookings/member-bookings';

type BookingDetailClientProps = {
  bookingId: string;
};

// 顯示目前登入會員自己的預約詳情與取消入口。
export function BookingDetailClient({ bookingId }: BookingDetailClientProps) {
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 載入單筆私人預約資料，後端會確認 booking 屬於目前會員。
    async function loadBooking() {
      try {
        const response = await getMyBooking(bookingId);

        if (isMounted) {
          setBooking(response.data);
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') {
          router.push(`/login?redirect=/my/bookings/${bookingId}`);
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

    void loadBooking();

    return () => {
      isMounted = false;
    };
  }, [bookingId, router]);

  // 送出取消預約請求，成功後重新載入詳情以呈現最新狀態。
  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsCancelling(true);

    try {
      await cancelMyBooking(bookingId, reason);
      const response = await getMyBooking(bookingId);

      setBooking(response.data);
      setReason('');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'BOOKING_NOT_CANCELABLE') {
        // 狀態可能已變更，重新取得詳情以顯示目前狀態。
        try {
          const response = await getMyBooking(bookingId);
          setBooking(response.data);
        } catch {
          // 重新載入失敗時仍顯示下方錯誤訊息。
        }
      }

      setErrorMessage(getCancelErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return <LoadingState title="正在載入預約詳情" description="請稍候。" />;
  }

  if (errorMessage && !booking) {
    return <ErrorState title="預約詳情暫時無法載入" description={errorMessage} />;
  }

  if (!booking) {
    return <EmptyState title="找不到預約" description="此預約不存在或不屬於目前登入會員。" />;
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">預約詳情</h1>
        <BookingStatusBadge status={booking.status} />
      </div>
      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <dt className="font-medium text-ink-muted">服務</dt>
          <dd className="mt-1 text-ink">{booking.service.name}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">時間</dt>
          <dd className="mt-1 text-ink">{formatDateTime(booking.slot.startAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-muted">備註</dt>
          <dd className="mt-1 text-ink">{booking.note ?? '無'}</dd>
        </div>
        {booking.cancelReason ? (
          <div>
            <dt className="font-medium text-ink-muted">取消原因</dt>
            <dd className="mt-1 text-ink">{booking.cancelReason}</dd>
          </div>
        ) : null}
      </dl>
      {canCancel(booking) ? (
        <Form className="mt-8 border-t border-border pt-6" onSubmit={handleCancel}>
          <FormField label="取消原因（選填）">
            <TextInput maxLength={1000} onChange={(event) => setReason(event.target.value)} type="text" value={reason} />
          </FormField>
          {errorMessage ? <FormError>{errorMessage}</FormError> : null}
          <Button disabled={isCancelling} type="submit" variant="secondary">
            {isCancelling ? '取消中...' : '取消預約'}
          </Button>
        </Form>
      ) : (
        <div className="mt-6">
          <Notice>{getCancelDisabledMessage(booking)}</Notice>
        </div>
      )}
      <Link className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-hover" href="/my/bookings">
        返回我的預約
      </Link>
    </Panel>
  );
}

// 前端先用開始時間與狀態控制按鈕顯示，後端仍會再次驗證。
function canCancel(booking: BookingDetail): boolean {
  return booking.status === 'confirmed' && new Date(booking.slot.startAt).getTime() >= Date.now() + 4 * 60 * 60 * 1000;
}

// 顯示不可取消原因，讓使用者不用送出後才知道限制。
function getCancelDisabledMessage(booking: BookingDetail): string {
  if (booking.status === 'cancelled') {
    return '此預約已取消。';
  }

  if (booking.status === 'completed') {
    return '此預約已完成，無法取消。';
  }

  return '距離開始時間少於 4 小時，無法取消。';
}

// 將取消預約錯誤碼轉為穩定 UI 訊息。
function getCancelErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'BOOKING_CANCEL_TOO_LATE') {
      return '距離開始時間少於 4 小時，無法取消。';
    }

    if (error.code === 'BOOKING_NOT_CANCELABLE') {
      return '此預約目前不可取消，請確認上方狀態。';
    }

    return getApiErrorMessage(error);
  }

  return '系統暫時無法處理請求。';
}

// 格式化預約時間，讓詳情頁以台灣常見日期時間呈現。
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
