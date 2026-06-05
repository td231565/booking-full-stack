import { describe, expect, it } from 'vitest';
import { SERVICE_LOCATION_LABEL } from '@/lib/config/service-location';
import { buildBookingIcs, type BookingIcsInput } from './build-booking-ics';

const bookingFixture: BookingIcsInput = {
  id: '1',
  service: {
    name: '服務, 名稱\\測試',
  },
  slot: {
    startAt: '2026-05-22T10:00:00.000Z',
    endAt: '2026-05-22T11:30:00.000Z',
  },
  note: '備註, \\ 測試',
};

describe('buildBookingIcs', () => {
  it('基本結構：含 VCALENDAR / VEVENT 起訖標記', () => {
    const ics = buildBookingIcs(bookingFixture);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('版本與方法：VERSION:2.0、METHOD:PUBLISH', () => {
    const ics = buildBookingIcs(bookingFixture);

    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('METHOD:PUBLISH');
  });

  it('時間：DTSTART / DTEND 為 UTC（Z）且與 fixture 對應', () => {
    const ics = buildBookingIcs(bookingFixture);

    expect(ics).toContain('DTSTART:20260522T100000Z');
    expect(ics).toContain('DTEND:20260522T113000Z');
  });

  it('地點與標題：SUMMARY、LOCATION（台北市信義區）', () => {
    const ics = buildBookingIcs(bookingFixture);

    expect(ics).toContain(`LOCATION:${SERVICE_LOCATION_LABEL}`);
    // 逗號 / 反斜線需要跳脫：, => \,；\ => \\
    expect(ics).toContain('SUMMARY:服務\\, 名稱\\\\測試');
  });

  it('穩定 UID：UID:booking-{id}@booking-scheduler', () => {
    const ics = buildBookingIcs(bookingFixture);

    expect(ics).toContain('UID:booking-1@booking-scheduler');
  });

  it('跳脫：服務名含逗號或反斜線仍輸出合法欄位', () => {
    const ics = buildBookingIcs(bookingFixture);

    // 確認 summary 的 escape 已生效（避免出現未跳脫逗號/反斜線）
    expect(ics).not.toContain('SUMMARY:服務, 名稱');
    expect(ics).toContain('SUMMARY:服務\\, 名稱\\\\測試');
  });

  it('換行：使用 CRLF（\\r\\n）', () => {
    const ics = buildBookingIcs(bookingFixture);

    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    // 檢查是否存在「非 CR 前綴」的孤立 LF，確保全程 CRLF。
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});

