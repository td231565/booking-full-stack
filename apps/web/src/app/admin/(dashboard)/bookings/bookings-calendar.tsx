'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, parseISO, isSameDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { AdminBooking } from '@/lib/admin/admin-api';
import { Button } from '@/components/ui/button';
import { BookingStatusBadge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/page';
import { CreateBookingDialog } from './create-booking-dialog';
import { UpdateNoteDialog } from './update-note-dialog';
import { EditBookingDialog } from './edit-booking-dialog';
import { CancelBookingDialog } from './cancel-booking-dialog';

interface BookingsCalendarProps {
  initialBookings: AdminBooking[];
  month: string; // YYYY-MM
}

export function BookingsCalendar({ initialBookings, month }: BookingsCalendarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 解析當前顯示的月份
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    const [year, m] = month.split('-').map(Number);
    return new Date(year, m - 1, 1);
  });

  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());

  // Dialog 狀態
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editingBooking, setEditingBooking] = React.useState<AdminBooking | null>(null);
  const [isNoteOpen, setIsNoteOpen] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isCancelOpen, setIsCancelOpen] = React.useState(false);

  // 當月份切換時，更新 URL 讓 Server Component 重新抓取資料
  const handleMonthChange = (newMonth: Date) => {
    setCurrentMonth(newMonth);
    const monthStr = format(newMonth, 'yyyy-MM');
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', monthStr);
    router.push(`${pathname}?${params.toString()}`);
  };

  // 取得選中日期的預約
  const selectedBookings = React.useMemo(() => {
    if (!selectedDate) return [];
    return initialBookings.filter((b) => isSameDay(parseISO(b.slot.startAt), selectedDate));
  }, [initialBookings, selectedDate]);

  // 修飾符：標示有預約的日期
  const modifiers = React.useMemo(() => {
    const dates = initialBookings.map((b) => parseISO(b.slot.startAt));
    return { hasBooking: dates };
  }, [initialBookings]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* 左側日曆 */}
      <div className="w-full lg:w-auto">
        <Panel className="flex flex-col items-center">
          <div className="mb-4 flex w-full items-center justify-between px-2">
            <h2 className="font-semibold text-ink">預約日曆</h2>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>新增預約</Button>
          </div>
          <Calendar
            mode="single"
            month={currentMonth}
            onMonthChange={handleMonthChange}
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={modifiers}
            modifiersClassNames={{
              hasBooking: 'relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-accent',
            }}
          />
        </Panel>
      </div>

      {/* 右側預約列表 */}
      <div className="flex-1">
        <Panel>
          <div className="mb-4 border-b border-border pb-2">
            <h2 className="font-semibold text-ink">
              {selectedDate ? format(selectedDate, 'yyyy年MM月dd日') : '請選擇日期'} 的預約
            </h2>
          </div>

          {selectedBookings.length > 0 ? (
            <ul className="space-y-4">
              {selectedBookings.map((booking) => (
                <li key={booking.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{booking.service.name}</p>
                      <p className="text-sm text-ink-muted">
                        {booking.user.displayName} ({format(parseISO(booking.slot.startAt), 'HH:mm')})
                      </p>
                    </div>
                    <BookingStatusBadge status={booking.status} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingBooking(booking);
                        setIsNoteOpen(true);
                      }}
                    >
                      修改備註
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingBooking(booking);
                        setIsEditOpen(true);
                      }}
                      disabled={booking.status !== 'confirmed'}
                    >
                      改期
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => {
                        setEditingBooking(booking);
                        setIsCancelOpen(true);
                      }}
                      disabled={booking.status === 'cancelled'}
                    >
                      取消
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">此日期無預約</p>
          )}
        </Panel>
      </div>

      {/* Dialogs */}
      <CreateBookingDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      
      {editingBooking && (
        <>
          <UpdateNoteDialog
            booking={editingBooking}
            open={isNoteOpen}
            onOpenChange={setIsNoteOpen}
          />
          <EditBookingDialog
            booking={editingBooking}
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
          />
          <CancelBookingDialog
            bookingId={editingBooking.id}
            open={isCancelOpen}
            onOpenChange={setIsCancelOpen}
          />
        </>
      )}
    </div>
  );
}

// 暫時定義按鈕 size props，若 Button 元件尚未支援則會被忽略。
interface ButtonProps {
  size?: 'sm' | 'md' | 'lg';
}
