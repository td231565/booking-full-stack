import { buildBookingIcs, type BookingIcsInput } from './build-booking-ics';
export { type BookingIcsInput };

// 將 .ics 內容建立 Blob 並觸發下載，並確保 revoke object URL。
export function downloadBookingIcs(booking: BookingIcsInput) {
  const ics = buildBookingIcs(booking);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `booking-${booking.id}.ics`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  // 釋放 URL，避免記憶體累積。
  URL.revokeObjectURL(url);
}

