import { describe, expect, it } from 'vitest';
import sample from './fixtures/wttr-j1-sample.json';
import { parseWttrJ1ForDate } from './parse-wttr-j1';

describe('parseWttrJ1ForDate', () => {
  it('命中日期：回傳 avgTempC、condition 等欄位', () => {
    const result = parseWttrJ1ForDate(sample, '2026-06-01');

    expect(result).toEqual({
      date: '2026-06-01',
      avgTempC: 28,
      minTempC: 24,
      maxTempC: 32,
      condition: '晴',
      chanceOfRain: 20,
    });
  });

  it('無匹配日：回傳 null', () => {
    expect(parseWttrJ1ForDate(sample, '2099-01-01')).toBeNull();
  });

  it('缺欄位：不 throw，回傳 null', () => {
    expect(parseWttrJ1ForDate({ weather: [{ date: '2026-06-01' }] }, '2026-06-01')).toBeNull();
    expect(parseWttrJ1ForDate(null, '2026-06-01')).toBeNull();
  });
});
