import { HistoricalKlineData } from "./interfaces";
import { enrichHistory, intervalMilliseconds, normalizeHistory } from "./indicators";
import { analyzeStrategy } from "./strategy";

export interface BacktestSettings {
  horizonBars: number; targetAtr: number; stopAtr: number;
  feeBpsPerSide: number; slippageBpsPerSide: number;
}
export const defaultBacktestSettings: BacktestSettings = {
  horizonBars: 12, targetAtr: 1.5, stopAtr: 1,
  feeBpsPerSide: 10, slippageBpsPerSide: 5
};
export interface BacktestTrade {
  signalTime: string; direction: "BULLISH" | "BEARISH";
  entryTime: string; entry: number; exit: number;
  exitReason: "TARGET" | "STOP" | "BOTH_STOP_FIRST" | "HORIZON";
  netReturn: number;
}
/** Only chronological, non-overlapping trades. Entry at next bar open; ambiguous intrabar ordering assumes stop first. */
export function backtest(raw: HistoricalKlineData[], interval: string,
  settings: BacktestSettings = defaultBacktestSettings): BacktestTrade[] {
  const rows = normalizeHistory(raw, Number.MAX_SAFE_INTEGER);
  if (rows.length < 32) return [];
  const step = intervalMilliseconds(interval);
  const trades: BacktestTrade[] = [];
  let lastExitIndex = -1;
  for (let i = 30; i + 1 < rows.length; i++) {
    if (i <= lastExitIndex || Date.parse(rows[i + 1].timestamp) - Date.parse(rows[i].timestamp) !== step) continue;
    const window = rows.slice(Math.max(0, i - 199), i + 1);
    const current = enrichHistory(window).at(-1)!;
    const event = analyzeStrategy(window, interval).events.find(e =>
      e.type === "CONFIRMED" && e.timestamp === Date.parse(current.timestamp));
    if (!event || current.atrValue == null || current.atrValue <= 0) continue;
    const direction = event.direction === "BULLISH" ? 1 : -1;
    const entryBar = rows[i + 1];
    const rawEntry = entryBar.openPrice;
    const slip = settings.slippageBpsPerSide / 10000;
    const entry = rawEntry * (1 + direction * slip);
    const target = entry + direction * settings.targetAtr * current.atrValue;
    const stop = entry - direction * settings.stopAtr * current.atrValue;
    const last = Math.min(rows.length - 1, i + settings.horizonBars);
    let exit = rows[last].closePrice;
    let exitIndex = last;
    let exitReason: BacktestTrade["exitReason"] = "HORIZON";
    let valid = true;
    for (let j = i + 1; j <= last; j++) {
      const bar = rows[j];
      if (j > i + 1 && Date.parse(bar.timestamp) - Date.parse(rows[j - 1].timestamp) !== step) {
        valid = false; break;
      }
      const hitTarget = direction > 0 ? bar.highPrice >= target : bar.lowPrice <= target;
      const hitStop = direction > 0 ? bar.lowPrice <= stop : bar.highPrice >= stop;
      if (hitTarget && hitStop) { exit = stop; exitIndex = j; exitReason = "BOTH_STOP_FIRST"; break; }
      if (hitStop) { exit = stop; exitIndex = j; exitReason = "STOP"; break; }
      if (hitTarget) { exit = target; exitIndex = j; exitReason = "TARGET"; break; }
    }
    if (!valid) continue;
    const executedExit = exit * (1 - direction * slip);
    const fees = 2 * settings.feeBpsPerSide / 10000;
    trades.push({
      signalTime: current.timestamp, direction: event.direction,
      entryTime: entryBar.timestamp, entry, exit: executedExit, exitReason,
      netReturn: direction * (executedExit - entry) / entry - fees
    });
    lastExitIndex = exitIndex;
  }
  return trades;
}
export function summarizeBacktest(trades: BacktestTrade[]) {
  const wins = trades.filter(t => t.netReturn > 0);
  const gains = trades.reduce((sum, t) => sum + Math.max(0, t.netReturn), 0);
  const losses = trades.reduce((sum, t) => sum + Math.max(0, -t.netReturn), 0);
  let equity = 1, peak = 1, maximumDrawdown = 0;
  for (const trade of trades) {
    equity *= 1 + trade.netReturn;
    peak = Math.max(peak, equity);
    maximumDrawdown = Math.max(maximumDrawdown, 1 - equity / peak);
  }
  return {
    trades: trades.length, winRate: trades.length ? wins.length / trades.length : null,
    meanReturn: trades.length ? trades.reduce((s, t) => s + t.netReturn, 0) / trades.length : null,
    compoundedReturn: equity - 1, maximumDrawdown,
    profitFactor: losses > 0 ? gains / losses : null
  };
}
