import { HistoricalKlineData } from "./interfaces";

export const HISTORY_LIMIT = 200;
export const RSI_PERIOD = 14;
export const EMA_PERIOD = 21;
export const ATR_PERIOD = 14;
export const RVOL_PERIOD = 20;

export function intervalMilliseconds(interval: string): number {
  const match = /^(\d+)([mhd])$/.exec(interval);
  if (!match) throw new Error(`Unsupported interval: ${interval}`);
  const unit = match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000;
  return Number(match[1]) * unit;
}

export function normalizeHistory(rows: HistoricalKlineData[], limit = HISTORY_LIMIT): HistoricalKlineData[] {
  const unique = new Map<number, HistoricalKlineData>();
  for (const row of rows) {
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time) ||
        ![row.openPrice, row.highPrice, row.lowPrice, row.closePrice].every(Number.isFinite) ||
        row.highPrice < Math.max(row.openPrice, row.closePrice, row.lowPrice) ||
        row.lowPrice > Math.min(row.openPrice, row.closePrice, row.highPrice) ||
        row.lowPrice <= 0 || (row.volume != null && (!Number.isFinite(row.volume) || row.volume < 0))) {
      throw new Error("Invalid OHLC candle");
    }
    unique.set(time, { ...row, timestamp: new Date(time).toISOString() });
  }
  return [...unique.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-limit);
}

/** Recompute from the same bounded chronological window on startup and on every close. */
export function enrichHistory(rows: HistoricalKlineData[]): HistoricalKlineData[] {
  const candles = normalizeHistory(rows);
  let ema: number | null = null;
  let avgGain: number | null = null;
  let avgLoss: number | null = null;
  let atr: number | null = null;
  let gainSum = 0;
  let lossSum = 0;
  let trSum = 0;
  let initialEmaSum = 0;

  return candles.map((row, i) => {
    const previous = i ? candles[i - 1] : null;
    initialEmaSum += i < EMA_PERIOD ? row.closePrice : 0;
    if (i === EMA_PERIOD - 1) ema = initialEmaSum / EMA_PERIOD;
    else if (i >= EMA_PERIOD && ema != null) {
      const alpha = 2 / (EMA_PERIOD + 1);
      ema += alpha * (row.closePrice - ema);
    }

    if (previous) {
      const difference = row.closePrice - previous.closePrice;
      const gain = Math.max(0, difference);
      const loss = Math.max(0, -difference);
      const trueRange = Math.max(
        row.highPrice - row.lowPrice,
        Math.abs(row.highPrice - previous.closePrice),
        Math.abs(row.lowPrice - previous.closePrice)
      );
      if (i <= RSI_PERIOD) {
        gainSum += gain;
        lossSum += loss;
        trSum += trueRange;
        if (i === RSI_PERIOD) {
          avgGain = gainSum / RSI_PERIOD;
          avgLoss = lossSum / RSI_PERIOD;
          atr = trSum / ATR_PERIOD;
        }
      } else if (avgGain != null && avgLoss != null && atr != null) {
        avgGain = (avgGain * (RSI_PERIOD - 1) + gain) / RSI_PERIOD;
        avgLoss = (avgLoss * (RSI_PERIOD - 1) + loss) / RSI_PERIOD;
        atr = (atr * (ATR_PERIOD - 1) + trueRange) / ATR_PERIOD;
      }
    }

    let rsi: number | null = null;
    if (avgGain != null && avgLoss != null) {
      if (avgGain === 0 && avgLoss === 0) rsi = 50;
      else if (avgLoss === 0) rsi = 100;
      else if (avgGain === 0) rsi = 0;
      else rsi = 100 - 100 / (1 + avgGain / avgLoss);
    }

    let relativeVolume: number | null = null;
    if (i >= RVOL_PERIOD - 1) {
      const volumes = candles.slice(i - RVOL_PERIOD + 1, i + 1).map(c => c.volume);
      if (volumes.every((v): v is number => v != null)) {
        const mean = volumes.reduce((total, v) => total + v, 0) / RVOL_PERIOD;
        relativeVolume = mean > 0 ? row.volume! / mean : null;
      }
    }
    return { ...row, emaValue: ema, rsiValue: rsi, atrValue: atr, relativeVolume };
  });
}
