// 前端消費的預約當日天氣資料（由 /api/weather 回傳）。
export type BookingDayWeather = {
  date: string;
  locationLabel: string;
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  condition: string;
  chanceOfRain: number | null;
};

// /api/weather 成功回應形狀。
export type WeatherApiResponse = {
  data: BookingDayWeather | null;
};
