import { HistoricalKlineData } from "./interfaces";

export const HISTORY_LIMIT = 200;
export const WARMUP_LIMIT = 1000;
export const RSI_PERIOD = 14;
export const EMA_PERIOD = 21;
export const ATR_PERIOD = 14;
export const RVOL_PERIOD = 20;

export interface IndicatorAccumulator {
  count: number; lastClose: number | null;
  ema: number | null; emaSeed: number;
  avgGain: number | null; avgLoss: number | null;
  gainSeed: number; lossSeed: number;
  atr: number | null; trSeed: number;
  volumes: number[];
}
export function initialAccumulator(): IndicatorAccumulator {
  return { count: 0, lastClose: null, ema: null, emaSeed: 0,
    avgGain: null, avgLoss: null, gainSeed: 0, lossSeed: 0,
    atr: null, trSeed: 0, volumes: [] };
}
export function intervalMilliseconds(interval: string): number {
  const match = /^(\d+)([mhd])$/.exec(interval);
  if (!match || Number(match[1]) <= 0) throw new Error(`Unsupported interval: ${interval}`);
  return Number(match[1]) * (match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000);
}
export function normalizeHistory(rows: HistoricalKlineData[], limit = HISTORY_LIMIT): HistoricalKlineData[] {
  const unique = new Map<number, HistoricalKlineData>();
  for (const row of rows) {
    const t = Date.parse(row.timestamp);
    if (!Number.isFinite(t) || ![row.openPrice, row.highPrice, row.lowPrice, row.closePrice].every(Number.isFinite) ||
      row.lowPrice <= 0 || row.highPrice < Math.max(row.openPrice, row.closePrice, row.lowPrice) ||
      row.lowPrice > Math.min(row.openPrice, row.closePrice, row.highPrice) ||
      (row.volume != null && (!Number.isFinite(row.volume) || row.volume < 0))) throw new Error("Invalid OHLC candle");
    unique.set(t, { ...row, timestamp: new Date(t).toISOString() });
  }
  return [...unique.values()].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-limit);
}
export function assertContiguous(rows: HistoricalKlineData[], interval: string): void {
  const step = intervalMilliseconds(interval);
  for (let i=1;i<rows.length;i++) if (Date.parse(rows[i].timestamp)-Date.parse(rows[i-1].timestamp)!==step)
    throw new Error(`Missing or out-of-order ${interval} candle at ${rows[i].timestamp}`);
}
export function indicatorRsi(state: IndicatorAccumulator): number | null {
  const { avgGain:g, avgLoss:l } = state;
  if (g == null || l == null) return null;
  if (g===0 && l===0) return 50;
  if (l===0) return 100;
  if (g===0) return 0;
  return 100-100/(1+g/l);
}
/** Never reset Wilder/EMA smoothing when the displayed history reaches its limit. */
export function appendIndicator(state: IndicatorAccumulator, candle: HistoricalKlineData):
  { state: IndicatorAccumulator; candle: HistoricalKlineData } {
  const s: IndicatorAccumulator = { ...state, volumes: [...state.volumes] };
  const i = s.count;
  if (i < EMA_PERIOD) s.emaSeed += candle.closePrice;
  if (i === EMA_PERIOD-1) s.ema = s.emaSeed/EMA_PERIOD;
  else if (i >= EMA_PERIOD && s.ema != null) s.ema += (candle.closePrice-s.ema)*2/(EMA_PERIOD+1);
  if (s.lastClose != null) {
    const diff = candle.closePrice-s.lastClose, gain = Math.max(diff,0), loss=Math.max(-diff,0);
    const tr = Math.max(candle.highPrice-candle.lowPrice, Math.abs(candle.highPrice-s.lastClose), Math.abs(candle.lowPrice-s.lastClose));
    if (i <= RSI_PERIOD) {
      s.gainSeed += gain; s.lossSeed += loss; s.trSeed += tr;
      if (i===RSI_PERIOD) {
        s.avgGain=s.gainSeed/RSI_PERIOD; s.avgLoss=s.lossSeed/RSI_PERIOD; s.atr=s.trSeed/ATR_PERIOD;
      }
    } else {
      s.avgGain=(s.avgGain!*(RSI_PERIOD-1)+gain)/RSI_PERIOD;
      s.avgLoss=(s.avgLoss!*(RSI_PERIOD-1)+loss)/RSI_PERIOD;
      s.atr=(s.atr!*(ATR_PERIOD-1)+tr)/ATR_PERIOD;
    }
  }
  if (candle.volume == null) s.volumes=[]; // Missing fallback volume cannot imply RVOL.
  else {
    s.volumes.push(candle.volume);
    if (s.volumes.length>RVOL_PERIOD) s.volumes.shift();
  }
  const mean=s.volumes.length===RVOL_PERIOD ? s.volumes.reduce((a,b)=>a+b,0)/RVOL_PERIOD : 0;
  const relativeVolume=mean>0 && candle.volume!=null ? candle.volume/mean : null;
  s.lastClose=candle.closePrice;
  s.count++;
  return { state:s, candle:{...candle, emaValue:s.ema, rsiValue:indicatorRsi(s), atrValue:s.atr, relativeVolume} };
}
export function buildIndicatorSeries(rows: HistoricalKlineData[], initial=initialAccumulator()):
  { history: HistoricalKlineData[]; state: IndicatorAccumulator } {
  let state=initial; const history:HistoricalKlineData[]=[];
  for (const candle of rows) {
    const result=appendIndicator(state,candle);
    state=result.state; history.push(result.candle);
  }
  return {history,state};
}
export function enrichHistory(rows: HistoricalKlineData[]): HistoricalKlineData[] {
  return buildIndicatorSeries(normalizeHistory(rows, Number.MAX_SAFE_INTEGER)).history;
}
