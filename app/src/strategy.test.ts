import assert from "node:assert/strict";
import test from "node:test";
import { HistoricalKlineData } from "./interfaces";
import { analyzeStrategy } from "./strategy";
const closes=[...Array.from({length:21},(_,i)=>120-i),103,106,108,110,111,112,113,114,112,105,108,110,117,120];
const candles:HistoricalKlineData[]=closes.map((p,i)=>({
 timestamp:new Date(Date.UTC(2025,0,1,0,i*5)).toISOString(),
 openPrice:p,highPrice:p+1,lowPrice:i===30?97:p-1,closePrice:p,volume:100,emaValue:null,rsiValue:null
}));
test("confirmed pivots only exist after their right-hand candles close",()=>{
 assert.equal(analyzeStrategy(candles.slice(0,32),"5m").armedDivergence,null);
 const a=analyzeStrategy(candles.slice(0,33),"5m").armedDivergence;
 assert.equal(a?.type,"BULLISH");assert.equal(a?.confirmationPrice,115);
 assert.equal(a?.secondPivotTimestamp,Date.parse(candles[30].timestamp));
});
test("a wick above resistance does not confirm; a CLOSE above does",()=>{
 const wick={...candles[33],openPrice:114,closePrice:114,highPrice:118,lowPrice:113};
 assert.equal(analyzeStrategy([...candles.slice(0,33),wick],"5m").armedDivergence?.type,"BULLISH");
 const result=analyzeStrategy(candles.slice(0,34),"5m");
 assert.equal(result.events.at(-1)?.type,"CONFIRMED");
 assert.equal(result.events.at(-1)?.timestamp,Date.parse(candles[33].timestamp));
});
test("bearish divergence is symmetric",()=>{
 const inverse=candles.map(c=>({...c,openPrice:250-c.openPrice,closePrice:250-c.closePrice,
   highPrice:250-c.lowPrice,lowPrice:250-c.highPrice}));
 assert.equal(analyzeStrategy(inverse.slice(0,33),"5m").armedDivergence?.type,"BEARISH");
 assert.equal(analyzeStrategy(inverse.slice(0,34),"5m").events.at(-1)?.type,"CONFIRMED");
});
test("invalidation precedes confirmation for a failed bullish setup",()=>{
 const fail:HistoricalKlineData={...candles[33],openPrice:90,highPrice:91,lowPrice:89,closePrice:90};
 const s=analyzeStrategy([...candles.slice(0,33),fail],"5m");
 assert.equal(s.events.at(-1)?.type,"INVALIDATED");assert.equal(s.armedDivergence,null);
});
test("stale armed divergence expires instead of remaining active indefinitely",()=>{
 const flat=Array.from({length:15},(_,i):HistoricalKlineData=>({
  ...candles[32],timestamp:new Date(Date.parse(candles[32].timestamp)+(i+1)*300000).toISOString(),
  openPrice:113,highPrice:114,lowPrice:112,closePrice:113
 }));
 const s=analyzeStrategy([...candles.slice(0,33),...flat],"5m");
 assert.ok(s.events.some(e=>e.type==="EXPIRED"));assert.equal(s.armedDivergence,null);
});
