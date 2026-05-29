'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { format, parseISO } from 'date-fns';
import { Dialog } from '@/components/ui/dialog';
import { Form, FormField, TextInput, FormError } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { 
  createAdminBooking, 
  lookupAdminUserByEmail, 
  getAdminAvailableSlots, 
  getAdminServices 
} from '@/lib/admin/admin-api';
import { getAdminErrorMessage } from '@/lib/api/error-messages';
import { cn } from '@/lib/utils';

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBookingDialog({ open, onOpenChange }: CreateBookingDialogProps) {
  const router = useRouter();
  
  // 使用者查詢狀態
  const [email, setEmail] = React.useState('');
  const [user, setUser] = React.useState<{ id: string; displayName: string } | null>(null);
  const [isLookingUp, setIsLookingUp] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);

  // 預約填寫狀態
  const [selectedServiceId, setSelectedServiceId] = React.useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = React.useState<string>('');
  const [note, setNote] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // 取得服務列表
  const { data: servicesResponse } = useSWR(
    open ? 'admin-services' : null,
    () => getAdminServices()
  );
  
  // 取得選中服務的可用時段
  const { data: slotsResponse, isLoading: isLoadingSlots } = useSWR(
    open && selectedServiceId ? ['admin-available-slots', selectedServiceId] : null,
    () => getAdminAvailableSlots(selectedServiceId)
  );

  const handleLookup = async () => {
    if (!email) return;
    setIsLookingUp(true);
    setLookupError(null);
    setUser(null);
    try {
      const res = await lookupAdminUserByEmail(email);
      setUser(res.data);
    } catch (err) {
      setLookupError(getAdminErrorMessage(err));
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedSlotId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createAdminBooking({
        userId: user.id,
        availabilitySlotId: selectedSlotId,
        note,
      });
      onOpenChange(false);
      resetForm();
      router.refresh();
    } catch (err) {
      setSubmitError(getAdminErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setUser(null);
    setSelectedServiceId('');
    setSelectedSlotId('');
    setNote('');
    setLookupError(null);
    setSubmitError(null);
  };

  const services = servicesResponse?.data || [];
  const slots = slotsResponse?.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="建立新預約">
      <Form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {/* 會員查詢 */}
          <div className="flex items-end gap-2">
            <FormField label="會員 Email" className="flex-1">
              <TextInput
                placeholder="輸入會員 Email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLookingUp || isSubmitting}
              />
            </FormField>
            <Button
              type="button"
              variant="secondary"
              onClick={handleLookup}
              disabled={isLookingUp || !email || isSubmitting}
            >
              {isLookingUp ? '查詢中' : '查詢'}
            </Button>
          </div>
          {lookupError && <FormError>{lookupError}</FormError>}
          {user && (
            <p className="text-sm font-medium text-accent bg-accent-soft px-3 py-2 rounded-md border border-accent/20">
              確認會員：{user.displayName}
            </p>
          )}

          {/* 服務選擇 */}
          <FormField label="選擇服務">
            <select
              className="w-full rounded-md border border-border bg-elevated px-3 py-2.5 text-base text-ink"
              value={selectedServiceId}
              onChange={(e) => {
                setSelectedServiceId(e.target.value);
                setSelectedSlotId('');
              }}
              disabled={!user || isSubmitting}
              required
            >
              <option value="">請選擇服務...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (${s.price})
                </option>
              ))}
            </select>
          </FormField>

          {/* 時段選擇 */}
          <FormField label="選擇時段">
            {isLoadingSlots ? (
              <p className="text-sm text-ink-muted">載入時段中...</p>
            ) : selectedServiceId && slots.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={cn(
                      'rounded border px-2 py-2 text-center text-sm transition-colors',
                      selectedSlotId === slot.id
                        ? 'border-accent bg-accent text-elevated'
                        : 'border-border hover:border-accent hover:text-accent'
                    )}
                    disabled={isSubmitting}
                  >
                    {format(parseISO(slot.startAt), 'MM/dd HH:mm')}
                  </button>
                ) )}
              </div>
            ) : selectedServiceId ? (
              <p className="text-sm text-ink-muted">目前無可用時段</p>
            ) : (
              <p className="text-sm text-ink-muted italic">請先選擇服務</p>
            )}
          </FormField>

          {/* 備註 */}
          <FormField label="備註 (選填)">
            <TextInput
              placeholder="輸入預約備註..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>
        </div>

        {submitError && <FormError>{submitError}</FormError>}

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting || !user || !selectedSlotId}>
            {isSubmitting ? '建立中...' : '確認建立'}
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}
