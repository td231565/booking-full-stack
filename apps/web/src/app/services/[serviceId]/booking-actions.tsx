'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FormError, TextInput } from '@/components/ui/form';
import { ApiClientError } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/error-messages';
import { createBooking } from '@/lib/bookings/member-bookings';
import { PublicAvailabilitySlot } from '@/lib/services/public-services';

type BookingActionsProps = {
  serviceId: string;
  slot: PublicAvailabilitySlot;
};

// 顯示單一時段的建立預約入口，未登入時由後端 401 觸發登入導向。
export function BookingActions({ serviceId, slot }: BookingActionsProps) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 送出建立預約請求，成功後導向自己的預約詳情。
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await createBooking(slot.id, note);

      // 成功後帶 query 觸發詳情頁日曆提示 Dialog。
      router.push(`/my/bookings/${response.data.id}?promptCalendar=1`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'UNAUTHENTICATED') {
        router.push(`/login?redirect=/services/${serviceId}`);
        return;
      }

      if (error instanceof ApiClientError && error.code === 'BOOKING_SLOT_UNAVAILABLE') {
        // 時段已被搶走時刷新頁面，讓 availability 列表與後端同步。
        router.refresh();
      }

      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="flex w-full flex-col gap-2 sm:w-auto sm:items-end" onSubmit={handleSubmit}>
      <TextInput
        aria-label="預約備註"
        className="sm:min-w-[12rem]"
        maxLength={1000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="備註（選填）"
        type="text"
        value={note}
      />
      <Button disabled={isSubmitting} type="submit">
        {isSubmitting ? '建立中...' : '預約'}
      </Button>
      {errorMessage ? <FormError>{errorMessage}</FormError> : null}
    </form>
  );
}

// 將預約錯誤碼轉為使用者可理解的訊息。
function getBookingErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'BOOKING_SLOT_UNAVAILABLE') {
      return '此時段目前不可預約，請重新整理後選擇其他時段。';
    }

    if (error.code === 'BOOKING_TOO_SOON') {
      return '只能預約 1 小時後開始的時段。';
    }

    if (error.code === 'BOOKING_DUPLICATED') {
      return '你已預約過此時段。';
    }

    return getApiErrorMessage(error);
  }

  return '系統暫時無法處理請求。';
}
