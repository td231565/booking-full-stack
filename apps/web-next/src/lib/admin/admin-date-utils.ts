/**
 * 計算給定月份字串 (YYYY-MM) 的起訖時間範圍。
 * 格式範例：'2026-06' -> { from: '2026-06-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' }
 */
export function getMonthDateRange(monthStr?: string): { from: string; to: string } {
  let year: number;
  let month: number; // 0-based

  const match = monthStr?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10) - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }

  // 該月第一天 00:00:00
  const from = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  
  // 該月最後一天 23:59:59.999
  // 技巧：下個月的第 0 天即為本月最後一天
  const to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
