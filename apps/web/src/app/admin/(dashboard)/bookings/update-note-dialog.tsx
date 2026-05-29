'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Form, FormField, TextInput, FormError } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { updateAdminBooking, AdminBooking } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';

interface UpdateNoteDialogProps {
  booking: Pick<AdminBooking, 'id' | 'note'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdateNoteDialog({ booking, open, onOpenChange }: UpdateNoteDialogProps) {
  const router = useRouter();
  const [note, setNote] = React.useState(booking.note || '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setNote(booking.note || '');
  }, [booking.note]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await updateAdminBooking(booking.id, { note });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(getAdminErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="修改預約備註">
      <Form onSubmit={handleSubmit}>
        <FormField label="備註">
          <textarea
            className="w-full rounded-md border border-border bg-elevated px-3 py-2.5 text-base text-ink placeholder:text-ink-muted/70 min-h-[100px]"
            placeholder="請輸入預約相關備註..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>

        {error && <FormError>{error}</FormError>}

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '更新中...' : '確認更新'}
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}
