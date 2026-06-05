// 將預約 slot ISO 時間轉為 Asia/Taipei 的 YYYY-MM-DD（供天氣 API query）。
export function slotStartToTaipeiDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}
