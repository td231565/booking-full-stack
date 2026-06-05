'use client';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { downloadBookingIcs, type BookingIcsInput } from '@/lib/calendar/download-booking-ics';

type AddToCalendarDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingIcsInput;
};

// 預約成功後詢問是否下載 .ics；文案中性以涵蓋各平台日曆 App。
export function AddToCalendarDialog({ open, onOpenChange, booking }: AddToCalendarDialogProps) {
  // 下載後關閉 Dialog，避免重複提示。
  function handleAdd() {
    downloadBookingIcs(booking);
    onOpenChange(false);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open} title="是否加入日曆？">
      <p className="text-sm leading-relaxed text-ink-muted">
        下載行程檔後，請以裝置上的日曆 App 開啟並加入。
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button onClick={() => onOpenChange(false)} type="button" variant="secondary">
          稍後
        </Button>
        <Button onClick={handleAdd} type="button">
          加入
        </Button>
      </div>
    </Dialog>
  );
}
