import Binance from "node-binance-api";
import express from "express";
import "dotenv/config";
import { BinanceDailyStat, HistoricalKlineData, KlineEvent } from "./interfaces";
import { enrichHistory, HISTORY_LIMIT, intervalMilliseconds, normalizeHistory } from "./indicators";
import { analyzeStrategy } from "./strategy";
import { SupabaseCoinRepository } from "./supabase/SupabaseCoinRepository";
import { saveKlineQueue } from "./queues/saveKlineQueue";
import { updateIndicatorQueue } from "./queues/updateIndicatorQueue";
import { webhookQueue } from "./queues/webhookQueue";

export const config = {
  dynamicSymbols: {
    enabled: process.env.DYNAMIC_SYMBOLS !== "false",
    quoteAsset: "USDT",
    minVolume24h: 1_000_000,
    maxSymbols: 20,
    fallbackSymbols: ["BTCUSDT", "ETHUSDT"],
    ignoredSymbols: ["OMUSDT"]
  },
  intervals: ["5m", "15m", "1h"],
  historyFetchLimit: HISTORY_LIMIT,
  alertIntervals: ["15m", "1h"]
};
type MarketState = Record<string, Record<string, HistoricalKlineData[]>>;
const histories: MarketState = {};
const streamLocks = new Map<string, Promise<void>>();
const bootstrapped = new Set<string>();

function candle(row: unknown[]): HistoricalKlineData {
  if (!Array.isArray(row) || row.length < 7) throw new Error("Invalid Binance candle");
  return {
    timestamp: new Date(Number(row[0])).toISOString(),
    openPrice: Number(row[1]), highPrice: Number(row[2]), lowPrice: Number(row[3]),
    closePrice: Number(row[4]), volume: Number(row[5]),
    emaValue: null, rsiValue: null
  };
}
async function fetchBinanceKlines(symbol: string, interval: string, options: {
  limit?: number; startTime?: number; endTime?: number
} = {}): Promise<HistoricalKlineData[]> {
  const url = new URL("/api/v3/klines", process.env.BINANCE_REST_URL || "https://api.binance.com");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(options.limit ?? HISTORY_LIMIT));
  if (options.startTime != null) url.searchParams.set("startTime", String(options.startTime));
  if (options.endTime != null) url.searchParams.set("endTime", String(options.endTime));
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Binance historical request failed: HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Binance historical response is not an array");
  return normalizeHistory(payload.filter((item): item is unknown[] => Array.isArray(item) &&
    Number(item[6]) < Date.now()).map(candle), options.limit ?? HISTORY_LIMIT);
}
function reconcile(symbol: string, interval: string, rows: HistoricalKlineData[]) {
  histories[symbol] ??= {};
  const history = enrichHistory(rows);
  histories[symbol][interval] = history;
  const snapshot = analyzeStrategy(history, interval);
  updateIndicatorQueue.enqueue({
    eventSymbol: symbol, interval, tfState: {
      lastHigh: snapshot.lastHigh, lastLow: snapshot.lastLow,
      armedDivergence: snapshot.armedDivergence
    }
  });
  bootstrapped.add(`${symbol}@${interval}`);
}
async function bootstrap(symbol: string, interval: string): Promise<void> {
  try {
    const data = await fetchBinanceKlines(symbol, interval);
    if (data.length < 30) throw new Error("Insufficient closed candles from Binance");
    reconcile(symbol, interval, data);
  } catch (error) {
    console.warn(`Binance bootstrap failed for ${symbol}@${interval}, trying saved history:`, error);
    const fallback = await SupabaseCoinRepository.getHistory(symbol, interval, HISTORY_LIMIT);
    if (fallback.length < 30) throw new Error(`No usable history for ${symbol}@${interval}`);
    const spacing = intervalMilliseconds(interval);
    const latest = Date.parse(fallback[fallback.length - 1].timestamp);
    if (Date.now() - latest > spacing * 2) throw new Error(`Saved history stale for ${symbol}@${interval}`);
    reconcile(symbol, interval, fallback);
  }
}
function processClosedCandle(symbol: string, interval: string, next: HistoricalKlineData, notify: boolean) {
  const previous = histories[symbol]?.[interval] ?? [];
  const last = previous.at(-1);
  const timestamp = Date.parse(next.timestamp);
  if (last && timestamp <= Date.parse(last.timestamp)) return; // Closed event duplicate/out of order.
  const history = enrichHistory([...previous, next]);
  const current = history.at(-1)!;
  const snapshot = analyzeStrategy(history, interval);
  histories[symbol][interval] = history;
  saveKlineQueue.enqueue({ eventSymbol: symbol, interval, newKlineData: current });
  updateIndicatorQueue.enqueue({ eventSymbol: symbol, interval, tfState: {
    lastHigh: snapshot.lastHigh, lastLow: snapshot.lastLow,
    armedDivergence: snapshot.armedDivergence
  } });
  if (notify && config.alertIntervals.includes(interval)) {
    for (const event of snapshot.events) {
      if (event.type !== "CONFIRMED" || event.timestamp !== timestamp) continue;
      webhookQueue.enqueue({
        eventSymbol: symbol, interval, rsi: current.rsiValue, ema: current.emaValue,
        atr: current.atrValue ?? null, relativeVolume: current.relativeVolume ?? null,
        date: timestamp, direction: event.direction, confirmationPrice: event.confirmationPrice
      });
    }
  }
}
async function handleKlineData(payload: KlineEvent): Promise<void> {
  if (!payload.k.x || !config.intervals.includes(payload.k.i)) return;
  const symbol = payload.s;
  const interval = payload.k.i;
  const key = `${symbol}@${interval}`;
  if (!bootstrapped.has(key)) return;
  const next: HistoricalKlineData = {
    timestamp: new Date(payload.k.t).toISOString(),
    openPrice: Number(payload.k.o), highPrice: Number(payload.k.h),
    lowPrice: Number(payload.k.l), closePrice: Number(payload.k.c),
    volume: Number(payload.k.v), emaValue: null, rsiValue: null
  };
  const last = histories[symbol][interval].at(-1);
  const step = intervalMilliseconds(interval);
  if (last) {
    const lastTime = Date.parse(last.timestamp);
    if (payload.k.t <= lastTime) return;
    const missing = Math.round((payload.k.t - lastTime) / step) - 1;
    if (missing > 0) {
      if (missing > 999) {
        await bootstrap(symbol, interval); // Safely resynchronize without historical notifications.
      } else {
        const backfill = await fetchBinanceKlines(symbol, interval, {
          startTime: lastTime + step, endTime: payload.k.t - 1, limit: 1000
        });
        if (backfill.length !== missing || backfill.some((row, index) =>
          Date.parse(row.timestamp) !== lastTime + step * (index + 1))) {
          await bootstrap(symbol, interval);
        } else {
          for (const row of backfill) processClosedCandle(symbol, interval, row, false);
        }
      }
    }
  }
  // A resynchronization can already include this candle.
  processClosedCandle(symbol, interval, next, true);
}
async function monitor() {
  const binance = new Binance({
    APIKEY: process.env.BINANCE_API_KEY, APISECRET: process.env.BINANCE_API_SECRET, reconnect: true
  });
  let symbols = config.dynamicSymbols.fallbackSymbols;
  if (config.dynamicSymbols.enabled) {
    try {
      const response = await binance.prevDay();
      const tickers: BinanceDailyStat[] = Array.isArray(response) ? response : [];
      const selected = tickers.filter(t => t.symbol.endsWith(config.dynamicSymbols.quoteAsset) &&
        !config.dynamicSymbols.ignoredSymbols.includes(t.symbol) &&
        Number.isFinite(Number(t.quoteVolume)) &&
        Number(t.quoteVolume) >= config.dynamicSymbols.minVolume24h)
        .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
        .slice(0, config.dynamicSymbols.maxSymbols).map(t => t.symbol);
      if (selected.length) symbols = selected;
    } catch (error) {
      console.error("Cannot select Binance symbols, using fallback", error);
    }
  }
  for (const symbol of symbols) {
    for (const interval of config.intervals) {
      try {
        await bootstrap(symbol, interval);
      } catch (error) {
        console.error(`Skipping ${symbol}@${interval}:`, error);
      }
    }
  }
  if (!bootstrapped.size) throw new Error("No symbol could be initialized");
  for (const key of bootstrapped) {
    const [symbol, interval] = key.split("@");
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    const callback = (payload: KlineEvent) => {
      if (payload.s !== symbol || payload.k.i !== interval || !payload.k.x) return;
      const previous = streamLocks.get(key) ?? Promise.resolve();
      const next = previous.then(() => handleKlineData(payload)).catch(error => {
        console.error(`Market stream processing failed for ${key}:`, error);
      });
      streamLocks.set(key, next);
    };
    const subscribe = (attempt: number) => {
      if (attempt > 10) {
        console.error(`WebSocket retries exhausted: ${key}`);
        return;
      }
      binance.websockets.subscribe(stream, callback, () => subscribe(attempt + 1), () => true);
    };
    subscribe(0);
  }
  console.info(`Monitoring ${bootstrapped.size} symbol/interval streams.`);
}
async function main() {
  await monitor();
  const app = express();
  app.get("/", (_request, response) => response.json({
    status: "running", monitoredStreams: bootstrapped.size,
    strategy: "confirmed-pivot-divergence", execution: "signals-only"
  }));
  const port = Number(process.env.API_PORT || 3000);
  app.listen(port, () => console.info(`Criypto API listening on ${port}`));
}
main().catch(error => { console.error("Startup failed:", error); process.exitCode = 1; });
