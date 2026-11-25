import type { HistoricalKlineData } from "./interfaces";
import { appendIndicator, assertContiguous, HISTORY_LIMIT, indicatorRsi, intervalMilliseconds, normalizeHistory, type IndicatorAccumulator } from "./indicators";
import { analyzeStrategy, type StrategySnapshot } from "./strategy";

export const CLOSE_GRACE_MS = 2_000;
export const PAGE_LIMIT = 1000;
export interface StreamState { history: HistoricalKlineData[]; calculator: IndicatorAccumulator }
export interface Checkpoint { timestamp: string; calculator: IndicatorAccumulator }

/** UTC candle-open timestamp of the most recently eligible closed candle. */
export function latestClosedOpen(now: number, interval: string, graceMs = CLOSE_GRACE_MS): number {
  const step = intervalMilliseconds(interval);
  return Math.floor((now - graceMs) / step) * step - step;
}

export function restoreCheckpoint(rows: HistoricalKlineData[], checkpoint: Checkpoint, interval: string): StreamState {
  const history = normalizeHistory(rows, HISTORY_LIMIT);
  assertContiguous(history, interval);
  const last = history.at(-1);
  const acc = checkpoint.calculator;
  const near = (a: number | null | undefined, b: number | null | undefined) =>
    a != null && b != null && Number.isFinite(a) && Number.isFinite(b) &&
    Math.abs(a-b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (history.length !== HISTORY_LIMIT || !last ||
      Date.parse(last.timestamp) !== Date.parse(checkpoint.timestamp) ||
      last.closePrice !== acc.lastClose || !near(last.rsiValue, indicatorRsi(acc)) ||
      !near(last.emaValue, acc.ema) || !near(last.atrValue, acc.atr)) {
    throw new Error("Checkpoint and persisted indicator history do not match; repair before resuming");
  }
  // Use the persisted, already-enriched prefix; never reseed its indicators on restart.
  return { history, calculator: acc };
}

export function replayPage(current: StreamState, raw: HistoricalKlineData[], interval: string) {
  const rows = normalizeHistory(raw, PAGE_LIMIT);
  if (!rows.length || rows.length !== raw.length || !current.history.length) throw new Error("Invalid recovery page");
  assertContiguous([current.history.at(-1)!, ...rows], interval);
  let state = current;
  const processed: Array<{ candle: HistoricalKlineData; snapshot: StrategySnapshot }> = [];
  for (const row of rows) {
    const next = appendIndicator(state.calculator, row);
    const history = [...state.history, next.candle].slice(-HISTORY_LIMIT);
    const snapshot = analyzeStrategy(history, interval, undefined, true);
    processed.push({ candle: next.candle, snapshot });
    state = { history, calculator: next.state };
  }
  return { state, processed };
}

interface RecoveryOptions {
  cursor: number; target: number; interval: string; maxPages?: number;
  read: (start: number, end: number, count: number) => Promise<HistoricalKlineData[]>;
  commit: (rows: HistoricalKlineData[]) => Promise<void>;
}

/** Exact, bounded, checkpoint-based pagination. Never advance across an incomplete page. */
export async function recoverPages({ cursor, target, interval, maxPages = 10, read, commit }: RecoveryOptions): Promise<number> {
  const step = intervalMilliseconds(interval);
  if (![cursor,target].every(Number.isSafeInteger) || cursor % step !== 0 || target % step !== 0 ||
      cursor > target || !Number.isInteger(maxPages) || maxPages < 1) throw new Error("Invalid recovery range");
  for (let page = 0; cursor < target && page < maxPages; page++) {
    const count = Math.min(PAGE_LIMIT, (target - cursor) / step);
    const start = cursor + step;
    const end = start + (count - 1) * step;
    const raw = await read(start, end, count);
    const rows = normalizeHistory(raw, PAGE_LIMIT);
    if (raw.length !== count || rows.length !== count ||
        rows.some((c,i) => Date.parse(c.timestamp) !== start + i*step)) {
      throw new Error("Incomplete recovery page; checkpoint not advanced");
    }
    await commit(rows);
    cursor = end;
  }
  return cursor;
}

export function signalPolicy(alertEnabled: boolean, timely: boolean): "notify" | "historical" | "disabled_interval" {
  return !timely ? "historical" : alertEnabled ? "notify" : "disabled_interval";
}
