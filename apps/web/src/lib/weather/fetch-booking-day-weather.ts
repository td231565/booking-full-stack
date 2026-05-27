import type { BookingDayWeather, WeatherApiResponse } from './types';

export class WeatherFetchError extends Error {
  constructor(message = '暫時無法取得天氣，請稍後再試。') {
    super(message);
    this.name = 'WeatherFetchError';
  }
}

// 向 Next Route Handler 取得指定日期的預約當日天氣；無預報資料時 data 為 null。
export async function fetchBookingDayWeather(date: string): Promise<BookingDayWeather | null> {
  const response = await fetch(`/api/weather?date=${encodeURIComponent(date)}`);

  if (!response.ok) {
    if (response.status === 502) {
      throw new WeatherFetchError();
    }

    throw new WeatherFetchError('天氣資料暫時無法載入。');
  }

  const body = (await response.json()) as WeatherApiResponse;

  return body.data ?? null;
}
