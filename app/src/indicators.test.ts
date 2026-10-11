import assert from "node:assert/strict";
import test from "node:test";
import { enrichHistory, normalizeHistory, intervalMilliseconds } from "./indicators";
import { HistoricalKlineData } from "./interfaces";
const make = (values: number[]): HistoricalKlineData[] => values.map((price, i) => ({
  timestamp: new Date(Date.UTC(2025, 0, 1, 0, i * 5)).toISOString(),
  openPrice: price, highPrice: price + 1, lowPrice: price - 1,
  closePrice: price, volume: 10, emaValue: null, rsiValue: null
}));
test("RSI stays neutral for constant prices and uses 14 changes", () => {
  const c = enrichHistory(make(Array(25).fill(100)));
  assert.equal(c[13].rsiValue, null);
  assert.equal(c[14].rsiValue, 50);
  assert.equal(c[24].rsiValue, 50);
});
test("RSI handles exclusively rising and falling closes", () => {
  assert.equal(enrichHistory(make(Array.from({ length: 25 }, (_, i) => 100 + i)))[24].rsiValue, 100);
  assert.equal(enrichHistory(make(Array.from({ length: 25 }, (_, i) => 100 - i)))[24].rsiValue, 0);
});
test("EMA21 starts at SMA21 and follows exponential recurrence", () => {
  const c = enrichHistory(make(Array.from({ length: 22 }, (_, i) => 100 + i)));
  assert.equal(c[19].emaValue, null);
  assert.equal(c[20].emaValue, 110);
  assert.equal(c[21].emaValue, 111);
  assert.equal(c[14].atrValue, 2);
  assert.equal(c[19].relativeVolume, 1);
});
test("replay is deterministic, sorts and deduplicates closed candles", () => {
  const raw = make(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i)));
  const sorted = normalizeHistory([...raw.slice().reverse(), raw[50]]);
  assert.equal(sorted.length, 100);
  assert.deepEqual(enrichHistory(raw), enrichHistory(sorted));
  assert.equal(intervalMilliseconds("15m"), 900000);
});
test("invalid candle and interval are rejected", () => {
  assert.throws(() => normalizeHistory([{ ...make([100])[0], lowPrice: 0 }]));
  assert.throws(() => intervalMilliseconds("bad"));
});
