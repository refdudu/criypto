import assert from "node:assert/strict";
import test from "node:test";
import type { HistoricalKlineData } from "./interfaces";
import { buildIndicatorSeries, HISTORY_LIMIT } from "./indicators";
import { latestClosedOpen, recoverPages, replayPage, restoreCheckpoint, signalPolicy } from "./marketRecovery";

const step=300_000;
const epoch=Date.UTC(2025,0,1);
const at=(i:number)=>epoch+i*step;
const bar=(i:number):HistoricalKlineData=>{
  const p=100+Math.sin(i/7)*10+i/100;
  return {timestamp:new Date(at(i)).toISOString(),openPrice:p,highPrice:p+1,lowPrice:p-1,closePrice:p,volume:10+i%5,emaValue:null,rsiValue:null};
};
const page=(start:number,_end:number,count:number)=>Promise.resolve(Array.from({length:count},(_,i)=>bar((start-epoch)/step+i)));
test("closed candle cutoff excludes current candle and allows exchange close grace",()=>{
  assert.equal(latestClosedOpen(at(8)+1999,"5m"),at(6));
  assert.equal(latestClosedOpen(at(8)+2000,"5m"),at(7));
});
test("recovery covers more than 1000 candles in exact pages",async()=>{
  const counts:number[]=[];const received:number[]=[];
  const cursor=await recoverPages({cursor:at(0),target:at(2101),interval:"5m",read:page,commit:async rows=>{
    counts.push(rows.length);received.push(...rows.map(r=>Date.parse(r.timestamp)));
  }});
  assert.deepEqual(counts,[1000,1000,101]);assert.equal(cursor,at(2101));
  assert.deepEqual(received,Array.from({length:2101},(_,i)=>at(i+1)));
});
test("bounded recovery yields a durable cursor for the next cycle",async()=>{
  let committed=at(0);
  const commit=async(rows:HistoricalKlineData[])=>{committed=Date.parse(rows.at(-1)!.timestamp);};
  assert.equal(await recoverPages({cursor:at(0),target:at(1001),interval:"5m",read:page,commit,maxPages:1}),at(1000));
  assert.equal(await recoverPages({cursor:committed,target:at(1001),interval:"5m",read:page,commit}),at(1001));
});
test("incomplete pages never advance the checkpoint",async()=>{
  let called=false;
  await assert.rejects(recoverPages({cursor:at(0),target:at(10),interval:"5m",
    read:async()=>[bar(1),bar(3)],commit:async()=>{called=true;}}),/Incomplete/);
  assert.equal(called,false);
});
test("failed commit leaves recovery resumable from the last durable page",async()=>{
  let checkpoint=at(0);
  await assert.rejects(recoverPages({cursor:checkpoint,target:at(1100),interval:"5m",read:page,commit:async rows=>{
    if(rows.length<1000)throw new Error("db timeout");
    checkpoint=Date.parse(rows.at(-1)!.timestamp);
  }}),/db timeout/);
  assert.equal(checkpoint,at(1000));
  assert.equal(await recoverPages({cursor:checkpoint,target:at(1100),interval:"5m",read:page,commit:async()=>{}}),at(1100));
});
test("restart uses persisted feature prefix and replays identically",()=>{
  const base=buildIndicatorSeries(Array.from({length:350},(_,i)=>bar(i)));
  const live={history:base.history.slice(-HISTORY_LIMIT),calculator:base.state};
  const restored=restoreCheckpoint(live.history,{timestamp:live.history.at(-1)!.timestamp,calculator:base.state},"5m");
  const next=Array.from({length:221},(_,i)=>bar(350+i));
  assert.deepEqual(replayPage(live,next,"5m"),replayPage(restored,next,"5m"));
  assert.throws(()=>restoreCheckpoint(live.history.slice(1),{timestamp:live.history.at(-1)!.timestamp,calculator:base.state},"5m"),/Checkpoint/);
  assert.throws(()=>restoreCheckpoint(live.history,{timestamp:live.history.at(-1)!.timestamp,calculator:{...base.state,ema:1}},"5m"),/Checkpoint/);
});
test("historical and disabled-interval signals cannot be notified",()=>{
  assert.equal(signalPolicy(true,false),"historical");
  assert.equal(signalPolicy(false,true),"disabled_interval");
  assert.equal(signalPolicy(true,true),"notify");
});
