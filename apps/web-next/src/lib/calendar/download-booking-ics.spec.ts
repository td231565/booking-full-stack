import { describe, expect, it, vi } from 'vitest';
import { downloadBookingIcs, type BookingIcsInput } from './download-booking-ics';

const bookingFixture: BookingIcsInput = {
  id: '1',
  service: {
    name: '服務',
  },
  slot: {
    startAt: '2026-05-22T10:00:00.000Z',
    endAt: '2026-05-22T11:30:00.000Z',
  },
  note: '備註',
};

describe('downloadBookingIcs', () => {
  it('下載觸發：建立 Blob(type=text/calendar...) 並下載 booking-{id}.ics', () => {
    const createdAnchors: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);

    // 攔截建立的 <a>，以便檢查 download/href。
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const el = originalCreateElement(tagName) as HTMLElement;
      if (tagName === 'a') {
        createdAnchors.push(el as HTMLAnchorElement);
      }
      return el;
    }) as typeof document.createElement);

    const url = 'blob:mock-url';
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue(url);
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBookingIcs(bookingFixture);

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith(url);

    // 檢查下載檔名。
    expect(createdAnchors).toHaveLength(1);
    expect(createdAnchors[0].download).toBe('booking-1.ics');

    // 檢查 Blob type，確保日曆檔格式正確。
    const blobPassed = createObjectUrl.mock.calls[0]?.[0] as Blob;
    expect(blobPassed).toBeInstanceOf(Blob);
    expect(blobPassed.type).toBe('text/calendar;charset=utf-8');
  });
});

