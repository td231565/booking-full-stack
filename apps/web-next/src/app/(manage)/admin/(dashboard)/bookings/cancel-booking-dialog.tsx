'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Form, FormField, TextInput, FormError } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { cancelAdminBooking } from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';

interface CancelBookingDialogProps {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CancelBookingDialog({ bookingId, open, onOpenChange }: CancelBookingDialogProps) {
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await cancelAdminBooking(bookingId, { reason });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(getAdminErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="取消預約">
      <Form onSubmit={handleSubmit}>
        <p className="text-sm text-ink-muted">請輸入取消原因，此動作將無法復原。</p>
        
        <FormField label="取消原因">
          <TextInput
            placeholder="例如：客戶要求、行程衝突..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </FormField>

        {error && <FormError>{error}</FormError>}

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            返回
          </Button>
          <Button type="submit" className="bg-red-500 hover:bg-red-600" disabled={isSubmitting}>
            {isSubmitting ? '取消中...' : '確認取消預約'}
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}
