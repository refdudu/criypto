import Binance from "node-binance-api";
import express from "express";
import "dotenv/config";
import { BinanceDailyStat, HistoricalKlineData, KlineEvent } from "./interfaces";
import { appendIndicator, assertContiguous, buildIndicatorSeries, HISTORY_LIMIT, WARMUP_LIMIT,
  IndicatorAccumulator, indicatorRsi, intervalMilliseconds, normalizeHistory } from "./indicators";
import { analyzeStrategy, StrategySnapshot } from "./strategy";
import { SupabaseCoinRepository, SignalOutboxEvent, StoredSnapshot } from "./supabase/SupabaseCoinRepository";
import { dispatchPendingSignals } from "./queues/webhookQueue";

export const config={
  dynamicSymbols:{enabled:process.env.DYNAMIC_SYMBOLS!=="false",quoteAsset:"USDT",
    minVolume24h:1_000_000,maxSymbols:20,fallbackSymbols:["BTCUSDT","ETHUSDT"],ignoredSymbols:["OMUSDT"]},
  intervals:["5m","15m","1h"],alertIntervals:["15m","1h"]
};
interface StreamState {history:HistoricalKlineData[];calculator:IndicatorAccumulator}
const streams=new Map<string,StreamState>();
const locks=new Map<string,Promise<void>>();
function parseCandle(row:unknown[]):HistoricalKlineData{
  if(!Array.isArray(row)||row.length<7)throw new Error("Invalid Binance candle");
  return {timestamp:new Date(Number(row[0])).toISOString(),openPrice:Number(row[1]),highPrice:Number(row[2]),
    lowPrice:Number(row[3]),closePrice:Number(row[4]),volume:Number(row[5]),emaValue:null,rsiValue:null};
}
async function fetchKlines(symbol:string,interval:string,options:{limit?:number;startTime?:number;endTime?:number}={}){
  const url=new URL("/api/v3/klines",process.env.BINANCE_REST_URL||"https://api.binance.com");
  url.searchParams.set("symbol",symbol);url.searchParams.set("interval",interval);
  url.searchParams.set("limit",String(options.limit??WARMUP_LIMIT));
  if(options.startTime!=null)url.searchParams.set("startTime",String(options.startTime));
  if(options.endTime!=null)url.searchParams.set("endTime",String(options.endTime));
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Binance klines HTTP ${response.status}`);
  const body:unknown=await response.json();
  if(!Array.isArray(body))throw new Error("Binance klines payload not an array");
  return normalizeHistory(body.filter((x):x is unknown[]=>Array.isArray(x)&&
    Number(x[6])<Date.now()).map(parseCandle),options.limit??WARMUP_LIMIT);
}
function restoreStream(raw:HistoricalKlineData[],saved:StoredSnapshot|null):StreamState {
  let {history,state}=buildIndicatorSeries(raw);
  if(saved){
    const i=raw.findIndex(c=>c.timestamp===new Date(saved.timestamp).toISOString()&&
      c.closePrice===saved.calculator.lastClose);
    if(i>=0){
      const acc=saved.calculator;
      const volumes=acc.volumes;
      const volumeMean=volumes.length===20?volumes.reduce((a,b)=>a+b,0)/20:0;
      const anchor={...history[i],emaValue:acc.ema,rsiValue:indicatorRsi(acc),atrValue:acc.atr,
        relativeVolume:volumeMean>0&&raw[i].volume!=null?raw[i].volume/volumeMean:null};
      const prefix=history.slice(0,i);
      history=[...prefix,anchor];
      state=acc;
      for(const next of raw.slice(i+1)){
        const result=appendIndicator(state,next);state=result.state;history.push(result.candle);
      }
    }
  }
  return {history:history.slice(-HISTORY_LIMIT),calculator:state};
}
async function bootstrap(symbol:string,interval:string){
  let raw:HistoricalKlineData[];
  try{raw=await fetchKlines(symbol,interval);}
  catch(error){
    console.warn(`REST bootstrap failed ${symbol}@${interval}; checking saved history`,error);
    raw=await SupabaseCoinRepository.getHistory(symbol,interval,WARMUP_LIMIT);
  }
  if(raw.length<HISTORY_LIMIT)throw new Error(`Insufficient history: ${symbol}@${interval}`);
  assertContiguous(raw,interval);
  const step=intervalMilliseconds(interval);
  if(Date.now()-Date.parse(raw.at(-1)!.timestamp)>step*3)throw new Error(`Stale history ${symbol}@${interval}`);
  const stored=await SupabaseCoinRepository.getSavedSnapshot(symbol,interval);
  const restored=restoreStream(raw,stored);
  const snapshot=analyzeStrategy(restored.history,interval,undefined,true);
  // One atomic historical reconciliation; no notifications are generated for historical candles.
  await SupabaseCoinRepository.persistBatch(symbol,interval,restored.history,snapshot,restored.calculator);
  streams.set(`${symbol}@${interval}`,restored);
}
function eventFor(symbol:string,interval:string,c:HistoricalKlineData,snapshot:StrategySnapshot):SignalOutboxEvent|null {
  if(!config.alertIntervals.includes(interval))return null;
  const t=Date.parse(c.timestamp);
  const confirmed=snapshot.events.find(e=>e.type==="CONFIRMED"&&e.timestamp===t);
  if(!confirmed)return null;
  const eventId=`${symbol}:${interval}:${confirmed.direction}:${t}`;
  const occurredAt=new Date(t+intervalMilliseconds(interval)).toISOString();
  const payload={eventId,id:symbol,symbol,interval,type:"DIVERGENCE_CONFIRMED",
    direction:confirmed.direction,confirmationPrice:confirmed.confirmationPrice,
    rsi:c.rsiValue,ema:c.emaValue,atr:c.atrValue??null,relativeVolume:c.relativeVolume??null,
    candleOpenTime:c.timestamp,signalTime:occurredAt,date:occurredAt};
  return {event_id:eventId,direction:confirmed.direction,occurred_at:occurredAt,payload};
}
async function processClosed(symbol:string,interval:string,next:HistoricalKlineData,notify:boolean){
  const key=`${symbol}@${interval}`,current=streams.get(key);
  if(!current)throw new Error(`No stream state for ${key}`);
  normalizeHistory([next]); // Reject invalid payload before changing state.
  const last=current.history.at(-1);
  if(last&&Date.parse(next.timestamp)<=Date.parse(last.timestamp))return;
  if(last&&Date.parse(next.timestamp)-Date.parse(last.timestamp)!==intervalMilliseconds(interval))
    throw new Error(`Noncontiguous market event: ${key}`);
  const processed=appendIndicator(current.calculator,next);
  const history=[...current.history,processed.candle].slice(-HISTORY_LIMIT);
  const snapshot=analyzeStrategy(history,interval,undefined,true);
  const event=notify?eventFor(symbol,interval,processed.candle,snapshot):null;
  // Persist before advancing in-memory state. A failed write is recovered through the next backfill.
  await SupabaseCoinRepository.persistBatch(symbol,interval,[processed.candle],snapshot,processed.state,event);
  streams.set(key,{history,calculator:processed.state});
}
async function handleKline(payload:KlineEvent){
  if(!payload.k.x||!config.intervals.includes(payload.k.i))return;
  const symbol=payload.s,interval=payload.k.i,key=`${symbol}@${interval}`;
  const current=streams.get(key);if(!current)return;
  const next:HistoricalKlineData={timestamp:new Date(payload.k.t).toISOString(),
    openPrice:Number(payload.k.o),highPrice:Number(payload.k.h),lowPrice:Number(payload.k.l),
    closePrice:Number(payload.k.c),volume:Number(payload.k.v),emaValue:null,rsiValue:null};
  const last=current.history.at(-1),step=intervalMilliseconds(interval);
  if(last){
    const lastTime=Date.parse(last.timestamp),now=Date.parse(next.timestamp);
    if(now<=lastTime)return;
    const difference=now-lastTime;
    if(difference%step!==0)throw new Error(`Misaligned candle ${key}`);
    const missing=difference/step-1;
    if(missing>10){await bootstrap(symbol,interval);}
    else if(missing>0){
      const backfill=await fetchKlines(symbol,interval,{startTime:lastTime+step,endTime:now-1,limit:missing});
      if(backfill.length!==missing||backfill.some((r,i)=>Date.parse(r.timestamp)!==lastTime+(i+1)*step))
        await bootstrap(symbol,interval);
      else for(const row of backfill)await processClosed(symbol,interval,row,false);
    }
  }
  await processClosed(symbol,interval,next,true);
}
async function monitor(){
  const binance=new Binance({APIKEY:process.env.BINANCE_API_KEY,APISECRET:process.env.BINANCE_API_SECRET,reconnect:true});
  let symbols:string[]=config.dynamicSymbols.fallbackSymbols;
  if(config.dynamicSymbols.enabled){
    try{
      const result=await binance.prevDay();
      const tickers:BinanceDailyStat[]=Array.isArray(result)?result:[];
      const selected=tickers.filter(t=>t.symbol.endsWith(config.dynamicSymbols.quoteAsset)&&
        !config.dynamicSymbols.ignoredSymbols.includes(t.symbol)&&Number.isFinite(Number(t.quoteVolume))&&
        Number(t.quoteVolume)>=config.dynamicSymbols.minVolume24h)
        .sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume))
        .slice(0,config.dynamicSymbols.maxSymbols).map(t=>t.symbol);
      if(selected.length)symbols=selected;
    }catch(e){console.error("Symbol discovery failed; using fallback",e);}
  }
  for(const symbol of symbols)for(const interval of config.intervals)try{await bootstrap(symbol,interval);}
  catch(error){console.error(`Unable to initialize ${symbol}@${interval}`,error);}
  if(!streams.size)throw new Error("No healthy streams; ensure the SQL migration is applied.");
  for(const key of streams.keys()){
    const [symbol,interval]=key.split("@"),stream=`${symbol.toLowerCase()}@kline_${interval}`;
    const callback=(payload:KlineEvent)=>{
      if(payload.s!==symbol||payload.k.i!==interval||!payload.k.x)return;
      const previous=locks.get(key)??Promise.resolve();
      const pending=previous.then(()=>handleKline(payload)).catch(error=>console.error(`Stream ${key}:`,error));
      locks.set(key,pending);
    };
    const subscribe=(attempt:number)=>{
      if(attempt>10){console.error(`Websocket retries exhausted ${key}`);return;}
      binance.websockets.subscribe(stream,callback,()=>subscribe(attempt+1),()=>true);
    };
    subscribe(0);
  }
  console.info(`Monitoring ${streams.size} streams`);
}
async function main(){
  await monitor();
  const poll=()=>void dispatchPendingSignals().catch(error=>console.error("Outbox dispatch:",error));
  poll();setInterval(poll,15000);
  const app=express();
  app.get("/",(_req,res)=>res.json({status:"running",monitoredStreams:streams.size,strategy:"confirmed-divergence",execution:"signals-only"}));
  const port=Number(process.env.API_PORT||3000);
  app.listen(port,()=>console.info(`Criypto listening on ${port}`));
}
main().catch(error=>{console.error("Fatal startup:",error);process.exit(1);});
