import { ApiListResponse, ApiSuccessResponse, apiFetch } from '@/lib/api/client';

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';

export type BookingSummary = {
  id: string;
  status: BookingStatus;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };
  slot: {
    id: string;
    startAt: string;
    endAt: string;
  };
  createdAt: string;
};

export type BookingDetail = BookingSummary & {
  note: string | null;
  cancelledAt: string | null;
  cancelledBy: 'user' | 'admin' | null;
  cancelReason: string | null;
  updatedAt: string;
};

export type CreatedBooking = {
  id: string;
  userId: string;
  serviceId: string;
  availabilitySlotId: string;
  status: 'confirmed';
  note: string | null;
  createdAt: string;
};

export type CancelledBooking = {
  id: string;
  status: 'cancelled';
  cancelledBy: 'user';
  cancelReason: string | null;
  cancelledAt: string;
};

// 建立目前登入會員的預約，userId 由後端 session 決定。
export async function createBooking(availabilitySlotId: string, note: string): Promise<ApiSuccessResponse<CreatedBooking>> {
  return apiFetch<ApiSuccessResponse<CreatedBooking>>('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      availabilitySlotId,
      note,
    }),
  });
}

// 取得目前登入會員自己的預約列表，私人資料固定使用 no-store。
export async function getMyBookings(): Promise<ApiListResponse<BookingSummary>> {
  return apiFetch<ApiListResponse<BookingSummary>>('/api/me/bookings?page=1&pageSize=20', {
    cache: 'no-store',
  });
}

// 取得目前登入會員自己的預約詳情，不可讀取他人預約。
export async function getMyBooking(bookingId: string): Promise<ApiSuccessResponse<BookingDetail>> {
  return apiFetch<ApiSuccessResponse<BookingDetail>>(`/api/me/bookings/${bookingId}`, {
    cache: 'no-store',
  });
}

// 取消目前登入會員自己的預約，取消限制由後端再次判斷。
export async function cancelMyBooking(bookingId: string, reason: string): Promise<ApiSuccessResponse<CancelledBooking>> {
  return apiFetch<ApiSuccessResponse<CancelledBooking>>(`/api/me/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      reason,
    }),
  });
}
