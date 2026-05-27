// wttr.in j1 中單日天氣的解析結果（尚未含地點標籤）。
export type ParsedWttrDay = {
  date: string;
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  condition: string;
  chanceOfRain: number | null;
};

type WttrJ1Payload = {
  weather?: Array<{
    date?: string;
    avgtempC?: string;
    maxtempC?: string;
    mintempC?: string;
    hourly?: Array<{
      weatherDesc?: Array<{ value?: string }>;
      chanceofrain?: string;
    }>;
  }>;
};

// 將字串轉為有限數字，無效時回傳 null。
function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

// 從 hourly 取第一筆天氣描述作為當日狀況文案。
function pickCondition(day: NonNullable<WttrJ1Payload['weather']>[number]): string | null {
  const fromHourly = day.hourly?.[0]?.weatherDesc?.[0]?.value?.trim();

  return fromHourly && fromHourly.length > 0 ? fromHourly : null;
}

// 從 hourly 取降雨機率（百分比整數），缺欄位時回傳 null。
function pickChanceOfRain(day: NonNullable<WttrJ1Payload['weather']>[number]): number | null {
  const raw = day.hourly?.[0]?.chanceofrain;
  const parsed = parseNumber(raw);

  return parsed === null ? null : Math.round(parsed);
}

// 從 wttr.in j1 回應抽出指定 YYYY-MM-DD 的當日天氣；無匹配或資料不足回傳 null。
export function parseWttrJ1ForDate(j1: unknown, date: string): ParsedWttrDay | null {
  if (!j1 || typeof j1 !== 'object') {
    return null;
  }

  const payload = j1 as WttrJ1Payload;
  const day = payload.weather?.find((entry) => entry.date === date);

  if (!day) {
    return null;
  }

  const avgTempC = parseNumber(day.avgtempC);
  const minTempC = parseNumber(day.mintempC);
  const maxTempC = parseNumber(day.maxtempC);
  const condition = pickCondition(day);

  if (avgTempC === null || minTempC === null || maxTempC === null || condition === null) {
    return null;
  }

  return {
    date,
    avgTempC,
    minTempC,
    maxTempC,
    condition,
    chanceOfRain: pickChanceOfRain(day),
  };
}
