'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { format, parseISO } from 'date-fns';
import { Dialog } from '@/components/ui/dialog';
import { Form, FormField, FormError } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { updateAdminBooking, getAdminAvailableSlots, AdminBooking, AdminAvailabilitySlot } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';
import { cn } from '@/lib/utils';

interface EditBookingDialogProps {
  booking: Pick<AdminBooking, 'id' | 'service' | 'slot'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditBookingDialog({ booking, open, onOpenChange }: EditBookingDialogProps) {
  const router = useRouter();
  const [selectedSlotId, setSelectedSlotId] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data: slotsResponse, isLoading: isLoadingSlots } = useSWR(
    open ? ['admin-available-slots', booking.service.id] : null,
    () => getAdminAvailableSlots(booking.service.id)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await updateAdminBooking(booking.id, { availabilitySlotId: selectedSlotId });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(getAdminErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const slots = slotsResponse?.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`修改預約時間 - ${booking.service.name}`}>
      <Form onSubmit={handleSubmit}>
        <div className="mb-4 text-sm text-ink-muted">
          目前預約：{format(parseISO(booking.slot.startAt), 'yyyy/MM/dd HH:mm')}
        </div>

        <FormField label="選擇新時段">
          {isLoadingSlots ? (
            <p className="py-4 text-center text-ink-muted">載入時段中...</p>
          ) : slots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto pr-1">
              {slots.map((slot) => {
                const isSelected = selectedSlotId === slot.id;
                const isCurrent = slot.id === booking.slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedSlotId(slot.id)}
                    disabled={isSubmitting || isCurrent}
                    className={cn(
                      'rounded border px-2 py-2 text-center text-sm transition-colors',
                      isSelected
                        ? 'border-accent bg-accent text-elevated'
                        : isCurrent
                        ? 'border-border bg-surface text-ink-muted opacity-50 cursor-not-allowed'
                        : 'border-border hover:border-accent hover:text-accent'
                    )}
                  >
                    {format(parseISO(slot.startAt), 'MM/dd HH:mm')}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-ink-muted">目前無可選時段</p>
          )}
        </FormField>

        {error && <FormError>{error}</FormError>}

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting || !selectedSlotId}>
            {isSubmitting ? '更新中...' : '確認改期'}
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}
