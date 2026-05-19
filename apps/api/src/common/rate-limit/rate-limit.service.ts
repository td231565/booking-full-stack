import { Injectable } from '@nestjs/common';

export type RateLimitConfig = {
  windowMs: number;
  max: number;
};

type CounterEntry = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitService {
  private readonly counters = new Map<string, CounterEntry>();

  // 檢查並消耗一次配額；超過限制時回 false，不會累加超額請求。
  tryConsume(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.counters.get(key);

    if (!entry || entry.resetAt <= now) {
      this.counters.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return true;
    }

    if (entry.count >= config.max) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  // 查詢目前 key 是否已達上限，供測試或除錯使用。
  isLimited(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.counters.get(key);

    if (!entry || entry.resetAt <= now) {
      return false;
    }

    return entry.count >= config.max;
  }
}
