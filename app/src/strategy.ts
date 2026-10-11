import { HistoricalKlineData, Pivot, ArmedDivergence } from "./interfaces";
import { enrichHistory, intervalMilliseconds } from "./indicators";

export interface StrategySettings {
  pivotLeft: number;
  pivotRight: number;
  maxPivotBars: number;
  minPivotBars: number;
  minRsiDifference: number;
  expiryBars: number;
  atrBreakoutBuffer: number;
  atrInvalidationBuffer: number;
}
export const strategySettings: StrategySettings = {
  pivotLeft: 2, pivotRight: 2, maxPivotBars: 60, minPivotBars: 3,
  minRsiDifference: 3, expiryBars: 14,
  atrBreakoutBuffer: 0, atrInvalidationBuffer: 0.25
};
export interface StrategyEvent {
  type: "CONFIRMED" | "INVALIDATED" | "EXPIRED";
  direction: "BULLISH" | "BEARISH";
  timestamp: number;
  confirmationPrice: number;
}
export interface StrategySnapshot {
  lastHigh: Pivot | null;
  lastLow: Pivot | null;
  armedDivergence: ArmedDivergence | null;
  events: StrategyEvent[];
}
const time = (c: HistoricalKlineData) => Date.parse(c.timestamp);

function pivotAt(rows: HistoricalKlineData[], i: number, left: number, right: number, type: "HIGH" | "LOW"): boolean {
  const candidate = rows[i];
  if (candidate.rsiValue == null || i < left || i + right >= rows.length) return false;
  for (let j = i - left; j <= i + right; j++) {
    if (i === j) continue;
    if (type === "LOW" ? rows[j].lowPrice <= candidate.lowPrice : rows[j].highPrice >= candidate.highPrice) return false;
  }
  return true;
}

/** Replay all confirmed bars; never use a pivot until its right-hand bars have closed. */
export function analyzeStrategy(rawHistory: HistoricalKlineData[], interval: string,
  options: StrategySettings = strategySettings): StrategySnapshot {
  const rows = enrichHistory(rawHistory);
  const events: StrategyEvent[] = [];
  let lastHigh: Pivot | null = null;
  let lastLow: Pivot | null = null;
  let lastHighIndex = -1;
  let lastLowIndex = -1;
  let armedDivergence: ArmedDivergence | null = null;
  const intervalMs = intervalMilliseconds(interval);

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i];
    const now = time(current);
    if (armedDivergence) {
      const a = armedDivergence;
      const direction = a.type;
      const emit = (type: StrategyEvent["type"]) => events.push({
        type, direction, timestamp: now, confirmationPrice: a.confirmationPrice
      });
      if (now - a.armedAtTimestamp >= options.expiryBars * intervalMs) {
        emit("EXPIRED");
        armedDivergence = null;
      } else if (direction === "BULLISH" ?
        current.closePrice < a.invalidationPrice :
        current.closePrice > a.invalidationPrice) {
        emit("INVALIDATED");
        armedDivergence = null;
      } else {
        const buffer = (current.atrValue ?? 0) * options.atrBreakoutBuffer;
        const confirmed = direction === "BULLISH"
          ? current.closePrice > a.confirmationPrice + buffer
          : current.closePrice < a.confirmationPrice - buffer;
        if (confirmed) {
          emit("CONFIRMED");
          armedDivergence = null;
        }
      }
    }
    const candidateIndex = i - options.pivotRight;
    if (candidateIndex < options.pivotLeft) continue;
    const candidate = rows[candidateIndex];
    const rsi = candidate.rsiValue;
    if (rsi == null) continue;
    const pivotTime = time(candidate);
    if (pivotAt(rows.slice(0, i + 1), candidateIndex, options.pivotLeft, options.pivotRight, "LOW")) {
      const prior = lastLow;
      const distance = candidateIndex - lastLowIndex;
      if (!armedDivergence && prior && distance >= options.minPivotBars &&
        distance <= options.maxPivotBars && candidate.lowPrice < prior.price &&
        rsi >= prior.rsi + options.minRsiDifference && (rsi < 30 || prior.rsi < 30)) {
        const between = rows.slice(lastLowIndex + 1, candidateIndex);
        if (between.length) {
          armedDivergence = {
            type: "BULLISH",
            confirmationPrice: Math.max(...between.map(c => c.highPrice)),
            invalidationPrice: candidate.lowPrice - (candidate.atrValue ?? 0) * options.atrInvalidationBuffer,
            armedAtTimestamp: now, secondPivotTimestamp: pivotTime
          };
        }
      }
      lastLow = { price: candidate.lowPrice, rsi, timestamp: pivotTime };
      lastLowIndex = candidateIndex;
    }
    if (pivotAt(rows.slice(0, i + 1), candidateIndex, options.pivotLeft, options.pivotRight, "HIGH")) {
      const prior = lastHigh;
      const distance = candidateIndex - lastHighIndex;
      if (!armedDivergence && prior && distance >= options.minPivotBars &&
        distance <= options.maxPivotBars && candidate.highPrice > prior.price &&
        rsi <= prior.rsi - options.minRsiDifference && (rsi > 70 || prior.rsi > 70)) {
        const between = rows.slice(lastHighIndex + 1, candidateIndex);
        if (between.length) {
          armedDivergence = {
            type: "BEARISH",
            confirmationPrice: Math.min(...between.map(c => c.lowPrice)),
            invalidationPrice: candidate.highPrice + (candidate.atrValue ?? 0) * options.atrInvalidationBuffer,
            armedAtTimestamp: now, secondPivotTimestamp: pivotTime
          };
        }
      }
      lastHigh = { price: candidate.highPrice, rsi, timestamp: pivotTime };
      lastHighIndex = candidateIndex;
    }
  }
  return { lastHigh, lastLow, armedDivergence, events };
}
