import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SERVICE_LOCATION_LABEL, SERVICE_LOCATION_WTTR_QUERY } from '@/lib/config/service-location';
import { parseWttrJ1ForDate } from '@/lib/weather/parse-wttr-j1';
import type { BookingDayWeather } from '@/lib/weather/types';

const CACHE_MAX_AGE_SECONDS = 30 * 60;

const dateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必須為 YYYY-MM-DD'),
});

// 建立穩定錯誤 JSON，供前端與測試斷言。
function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// 代理 wttr.in j1 並回傳精簡的預約當日天氣。
export async function GET(request: NextRequest) {
  const parsed = dateQuerySchema.safeParse({
    date: request.nextUrl.searchParams.get('date'),
  });

  if (!parsed.success) {
    return errorResponse(400, 'INVALID_QUERY', '請提供有效的 date 參數（YYYY-MM-DD）。');
  }

  const { date } = parsed.data;
  const upstreamUrl = `https://wttr.in/${encodeURIComponent(SERVICE_LOCATION_WTTR_QUERY)}?format=j1`;

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        // wttr.in 要求非預設 User-Agent，否則可能回 403。
        'User-Agent': 'BookingScheduler/1.0',
      },
      next: { revalidate: CACHE_MAX_AGE_SECONDS },
    });
  } catch {
    return errorResponse(502, 'WEATHER_UPSTREAM_ERROR', '暫時無法取得天氣，請稍後再試。');
  }

  if (!upstreamResponse.ok) {
    return errorResponse(502, 'WEATHER_UPSTREAM_ERROR', '暫時無法取得天氣，請稍後再試。');
  }

  let j1: unknown;

  try {
    j1 = await upstreamResponse.json();
  } catch {
    return errorResponse(502, 'WEATHER_UPSTREAM_ERROR', '暫時無法取得天氣，請稍後再試。');
  }

  const parsedDay = parseWttrJ1ForDate(j1, date);
  const data: BookingDayWeather | null = parsedDay
    ? {
        date: parsedDay.date,
        locationLabel: SERVICE_LOCATION_LABEL,
        avgTempC: parsedDay.avgTempC,
        minTempC: parsedDay.minTempC,
        maxTempC: parsedDay.maxTempC,
        condition: parsedDay.condition,
        chanceOfRain: parsedDay.chanceOfRain,
      }
    : null;

  return NextResponse.json(
    { data },
    {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE_SECONDS}, s-maxage=${CACHE_MAX_AGE_SECONDS}`,
      },
    },
  );
}
