import assert from "node:assert/strict";
import test from "node:test";
import { backtest, summarizeBacktest } from "./backtest";
test("empty histories have no invented prediction statistics", () => {
  assert.deepEqual(backtest([], "15m"), []);
  const metrics = summarizeBacktest([]);
  assert.equal(metrics.trades, 0);
  assert.equal(metrics.winRate, null);
  assert.equal(metrics.profitFactor, null);
});
