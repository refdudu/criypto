import assert from "node:assert/strict";
import test from "node:test";
import { HistoricalKlineData } from "./interfaces";
import { analyzeStrategy } from "./strategy";

const closes = [
  ...Array.from({ length: 21 }, (_, i) => 120 - i),
  103, 106, 108, 110, 111, 112, 113, 114, 112, 105, 108, 110, 117, 120
];
const candles: HistoricalKlineData[] = closes.map((price, i) => ({
  timestamp: new Date(Date.UTC(2025, 0, 1, 0, i * 5)).toISOString(),
  openPrice: price, highPrice: price + 1, lowPrice: i === 30 ? 97 : price - 1,
  closePrice: price, volume: 100, emaValue: null, rsiValue: null
}));
test("confirmed pivots are not available before two right-hand bars close", () => {
  assert.equal(analyzeStrategy(candles.slice(0, 32), "5m").armedDivergence, null);
  const armed = analyzeStrategy(candles.slice(0, 33), "5m").armedDivergence;
  assert.equal(armed?.type, "BULLISH");
  assert.equal(armed?.confirmationPrice, 115);
  assert.equal(armed?.secondPivotTimestamp, Date.parse(candles[30].timestamp));
});
test("a candle must CLOSE past confirmation, not merely wick through it", () => {
  const wick = { ...candles[33], closePrice: 114, openPrice: 114, highPrice: 118, lowPrice: 113 };
  const stillArmed = analyzeStrategy([...candles.slice(0, 33), wick], "5m");
  assert.equal(stillArmed.armedDivergence?.type, "BULLISH");
  const confirmed = analyzeStrategy(candles.slice(0, 34), "5m");
  assert.equal(confirmed.events.at(-1)?.type, "CONFIRMED");
  assert.equal(confirmed.events.at(-1)?.direction, "BULLISH");
  assert.equal(confirmed.events.at(-1)?.timestamp, Date.parse(candles[33].timestamp));
});
test("symmetric bearish pivots and close confirmation", () => {
  const inverse = candles.map(c => ({
    ...c, openPrice: 250 - c.openPrice, closePrice: 250 - c.closePrice,
    highPrice: 250 - c.lowPrice, lowPrice: 250 - c.highPrice
  }));
  assert.equal(analyzeStrategy(inverse.slice(0, 33), "5m").armedDivergence?.type, "BEARISH");
  const result = analyzeStrategy(inverse.slice(0, 34), "5m");
  assert.equal(result.events.at(-1)?.type, "CONFIRMED");
  assert.equal(result.events.at(-1)?.direction, "BEARISH");
});
