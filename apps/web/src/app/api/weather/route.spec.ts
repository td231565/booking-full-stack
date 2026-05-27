import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sample from '@/lib/weather/fixtures/wttr-j1-sample.json';
import { GET } from './route';

function createWeatherRequest(date?: string) {
  const url = date ? `http://localhost/api/weather?date=${date}` : 'http://localhost/api/weather';

  return new NextRequest(url);
}

describe('GET /api/weather', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('缺少 date：400 + 穩定 error body', async () => {
    const response = await GET(createWeatherRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INVALID_QUERY',
        message: '請提供有效的 date 參數（YYYY-MM-DD）。',
      },
    });
  });

  it('合法 date：mock wttr.in → 200 + 精簡 JSON 形狀', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sample), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const response = await GET(createWeatherRequest('2026-06-01'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        date: '2026-06-01',
        locationLabel: '台北市信義區',
        avgTempC: 28,
        minTempC: 24,
        maxTempC: 32,
        condition: '晴',
        chanceOfRain: 20,
      },
    });
  });

  it('上游失敗：502 + 穩定訊息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('error', { status: 503 })),
    );

    const response = await GET(createWeatherRequest('2026-06-01'));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'WEATHER_UPSTREAM_ERROR',
        message: '暫時無法取得天氣，請稍後再試。',
      },
    });
  });

  it('回應含 Cache-Control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(sample), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const response = await GET(createWeatherRequest('2026-06-01'));

    expect(response.headers.get('Cache-Control')).toContain('max-age=1800');
  });
});
