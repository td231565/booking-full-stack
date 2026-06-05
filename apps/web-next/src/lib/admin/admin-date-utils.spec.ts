import { describe, it, expect } from 'vitest';
import { getMonthDateRange } from './admin-date-utils';

describe('getMonthDateRange', () => {
  it('應能正確計算給定月份的範圍', () => {
    const { from, to } = getMonthDateRange('2026-06');
    // 6月有30天
    expect(from).toBe('2026-06-01T00:00:00.000Z');
    expect(to).toBe('2026-06-30T23:59:59.999Z');
  });

  it('應能正確處理 2 月（平年）', () => {
    const { from, to } = getMonthDateRange('2026-02');
    expect(from).toBe('2026-02-01T00:00:00.000Z');
    expect(to).toBe('2026-02-28T23:59:59.999Z');
  });

  it('傳入無效字串時應預設為當月', () => {
    const { from, to } = getMonthDateRange('invalid');
    const now = new Date();
    const expectedYear = now.getFullYear();
    const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');
    
    expect(from).toContain(`${expectedYear}-${expectedMonth}-01`);
  });
});
