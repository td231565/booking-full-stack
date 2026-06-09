import { SERVICE_LOCATION_LABEL } from '@/lib/config/service-location';

export type BookingIcsInput = {
  id: string;
  service: {
    name: string;
  };
  slot: {
    startAt: string;
    endAt: string;
  };
  note: string | null;
};

// 產生 RFC 5545 相容的 VCALENDAR 字串（含 VEVENT）。
export function buildBookingIcs(booking: BookingIcsInput): string {
  const dtStart = toIcsUtcDateTime(booking.slot.startAt);
  const dtEnd = toIcsUtcDateTime(booking.slot.endAt);
  const summary = escapeIcsText(booking.service.name);
  const location = SERVICE_LOCATION_LABEL;
  const uid = `booking-${booking.id}@booking-scheduler`;

  const note = booking.note?.trim() ? booking.note : '無';
  const description = escapeIcsText(`備註：${note}\\n預約編號：${booking.id}`);

  const prodId = '-//Booking Scheduler//ZH-TW//';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // 使用 CRLF，提升 Windows 日曆相容性。
  return lines.join('\r\n') + '\r\n';
}

// 將 ISO 時間字串轉為 UTC 的 RFC 5545 格式：YYYYMMDDTHHMMSSZ。
function toIcsUtcDateTime(iso: string): string {
  const date = new Date(iso);

  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// 將文字欄位依 RFC 5545 進行最小必要跳脫，避免逗號/反斜線破壞欄位。
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\') // 先處理反斜線避免後續 escape 被覆蓋
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/\n/g, '\\n');
}

