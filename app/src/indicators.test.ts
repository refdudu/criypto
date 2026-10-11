import assert from "node:assert/strict";
import test from "node:test";
import { appendIndicator,buildIndicatorSeries,enrichHistory,initialAccumulator,normalizeHistory,assertContiguous,intervalMilliseconds } from "./indicators";
import { HistoricalKlineData } from "./interfaces";
const make=(values:number[]):HistoricalKlineData[]=>values.map((price,i)=>({
  timestamp:new Date(Date.UTC(2025,0,1,0,i*5)).toISOString(),
  openPrice:price,highPrice:price+1,lowPrice:price-1,closePrice:price,volume:10,emaValue:null,rsiValue:null
}));
test("RSI 14 initializes on the fifteenth close and stays neutral on flat candles",()=>{
  const c=enrichHistory(make(Array(25).fill(100)));
  assert.equal(c[13].rsiValue,null);assert.equal(c[14].rsiValue,50);assert.equal(c[24].rsiValue,50);
});
test("RSI correctly handles only rising/falling prices",()=>{
  assert.equal(enrichHistory(make(Array.from({length:25},(_,i)=>100+i)))[24].rsiValue,100);
  assert.equal(enrichHistory(make(Array.from({length:25},(_,i)=>100-i)))[24].rsiValue,0);
});
test("EMA, ATR and RVOL values",()=>{
  const c=enrichHistory(make(Array.from({length:22},(_,i)=>100+i)));
  assert.equal(c[19].emaValue,null);assert.equal(c[20].emaValue,110);assert.equal(c[21].emaValue,111);
  assert.equal(c[14].atrValue,2);assert.equal(c[19].relativeVolume,1);
});
test("incremental indicators are identical to full replay beyond 200 candles",()=>{
  const raw=make(Array.from({length:320},(_,i)=>100+Math.sin(i/8)*4+i/20));
  let state=initialAccumulator();const streamed:HistoricalKlineData[]=[];
  for(const row of raw){const next=appendIndicator(state,row);state=next.state;streamed.push(next.candle);}
  assert.deepEqual(streamed,buildIndicatorSeries(raw).history);
  assert.deepEqual(streamed,enrichHistory(raw));
  const resumed=appendIndicator(state,{...raw.at(-1)!,timestamp:new Date(Date.UTC(2025,0,2,3,0)).toISOString()});
  assert.equal(resumed.state.count,321);
});
test("missing volume disables RVOL until twenty new valid observations",()=>{
  const raw=make(Array(45).fill(100));
  raw[22]={...raw[22],volume:undefined};
  const c=enrichHistory(raw);
  assert.equal(c[22].relativeVolume,null);assert.equal(c[40].relativeVolume,null);assert.equal(c[41].relativeVolume,null);assert.equal(c[42].relativeVolume,1);
});
test("history normalizes duplicates, validates OHLC and checks continuity",()=>{
  const raw=make([100,101,102]);
  assert.equal(normalizeHistory([...raw.slice().reverse(),raw[1]]).length,3);
  assert.throws(()=>normalizeHistory([{...raw[0],lowPrice:0}]));
  assert.throws(()=>assertContiguous([raw[0],raw[2]],"5m"));
  assert.equal(intervalMilliseconds("15m"),900000);
  assert.throws(()=>intervalMilliseconds("0m"));
});
