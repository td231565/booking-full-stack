'use client';

import { Button } from '@/components/ui/button';
import { downloadBookingIcs, type BookingIcsInput } from '@/lib/calendar/download-booking-ics';
import type { BookingStatus } from '@/lib/bookings/member-bookings';

type AddToCalendarButtonProps = {
  booking: BookingIcsInput & {
    status: BookingStatus;
  };
};

// 非 cancelled 預約顯示「加入日曆」，點擊下載 .ics 行程檔。
export function AddToCalendarButton({ booking }: AddToCalendarButtonProps) {
  if (booking.status === 'cancelled') {
    return null;
  }

  // 觸發瀏覽器下載 .ics，由各平台日曆 App 自行匯入。
  function handleClick() {
    downloadBookingIcs({
      id: booking.id,
      service: booking.service,
      slot: booking.slot,
      note: booking.note,
    });
  }

  return (
    <Button onClick={handleClick} type="button" variant="secondary">
      加入日曆
    </Button>
  );
}
