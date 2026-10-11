import assert from "node:assert/strict";
import test from "node:test";
import { backtest,simulateExit,summarizeBacktest } from "./backtest";
import type { HistoricalKlineData } from "./interfaces";
const bar=(i:number,open:number,high:number,low:number,close:number):HistoricalKlineData=>({
 timestamp:new Date(Date.UTC(2025,0,1,0,i*15)).toISOString(),
 openPrice:open,highPrice:high,lowPrice:low,closePrice:close,emaValue:null,rsiValue:null,volume:10
});
test("empty backtests never invent win rates",()=>{
  assert.deepEqual(backtest([],"15m"),[]);
  const metrics=summarizeBacktest([]);
  assert.equal(metrics.trades,0);assert.equal(metrics.winRate,null);assert.equal(metrics.profitFactor,null);
});
test("long and short gaps execute at opening price, not previous stop",()=>{
  const rows=[bar(0,100,101,99,100),bar(1,95,96,94,95)];
  assert.deepEqual(simulateExit(rows,1,1,1,105,98),{exit:95,exitIndex:1,reason:"GAP_STOP"});
  const short=[bar(0,100,101,99,100),bar(1,110,111,109,110)];
  assert.deepEqual(simulateExit(short,1,1,-1,95,103),{exit:110,exitIndex:1,reason:"GAP_STOP"});
});
test("both stop and target in one bar assumes stop first",()=>{
  const rows=[bar(0,100,101,99,100),bar(1,100,110,90,101)];
  assert.equal(simulateExit(rows,1,1,1,105,95).reason,"BOTH_STOP_FIRST");
  assert.equal(simulateExit(rows,1,1,1,105,95).exit,95);
});
test("invalid parameters and nonconsecutive history are rejected",()=>{
  assert.throws(()=>backtest([],"15m",{horizonBars:0,targetAtr:1,stopAtr:1,feeBpsPerSide:10,slippageBpsPerSide:5}));
  assert.throws(()=>backtest([bar(0,100,101,99,100),bar(2,100,101,99,100)],"15m"));
});
