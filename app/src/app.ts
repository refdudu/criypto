import express from "express";
import "dotenv/config";
import type { HistoricalKlineData } from "./interfaces";
import { assertContiguous, buildIndicatorSeries, HISTORY_LIMIT, WARMUP_LIMIT, intervalMilliseconds, normalizeHistory } from "./indicators";
import { analyzeStrategy, type StrategySnapshot } from "./strategy";
import { SupabaseCoinRepository, type SignalOutboxEvent } from "./supabase/SupabaseCoinRepository";
import { dispatchPendingSignals } from "./queues/webhookQueue";
import { CLOSE_GRACE_MS, latestClosedOpen, recoverPages, replayPage, restoreCheckpoint, signalPolicy, type StreamState } from "./marketRecovery";

const config = {
  dynamicSymbols: process.env.DYNAMIC_SYMBOLS !== "false",
  fallbackSymbols: ["BTCUSDT", "ETHUSDT"], intervals: ["5m","15m","1h"], alertIntervals: ["15m","1h"],
  maxSymbols: 20, minVolume24h: 1_000_000, pollMs: 10_000, maxConcurrent: 4, allowedLagMs: 60_000
};
interface Stream {
  symbol: string; interval: string; state?: StreamState; lastCandle?: number;
  failures: number; retryAt: number; lastError: boolean;
}
const streams: Stream[] = [];
let polling = false;
let rateLimitedUntil = 0;

async function marketFetch(path: string, params: Record<string,string> = {}): Promise<unknown> {
  if (Date.now() < rateLimitedUntil) throw new Error("Binance rate-limit cooldown");
  const url = new URL(path, process.env.BINANCE_REST_URL || "https://api.binance.com");
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (response.status === 429 || response.status === 418) {
    const header = response.headers.get("retry-after");
    const seconds = header == null ? NaN : Number(header);
    const delay = Number.isFinite(seconds) ? seconds*1000 : header ? Date.parse(header)-Date.now() : NaN;
    rateLimitedUntil = Math.max(rateLimitedUntil, Date.now()+Math.max(60_000, Number.isFinite(delay)?delay:0));
  }
  if (!response.ok) throw new Error("Binance HTTP " + response.status);
  return response.json();
}

async function fetchKlines(symbol: string, interval: string, limit: number, end: number, start?: number) {
  const step = intervalMilliseconds(interval);
  const params: Record<string,string> = { symbol, interval, limit: String(limit), endTime: String(end+step-1) };
  if (start != null) params.startTime = String(start);
  const body = await marketFetch("/api/v3/klines", params);
  if (!Array.isArray(body)) throw new Error("Invalid Binance kline payload");
  const rows: HistoricalKlineData[] = body.map((row: unknown) => {
    if (!Array.isArray(row) || row.length < 7) throw new Error("Invalid Binance candle");
    const openTime = Number(row[0]), closeTime = Number(row[6]);
    if (!Number.isSafeInteger(openTime) || openTime % step !== 0 || closeTime !== openTime+step-1 ||
        openTime > end || closeTime >= Date.now()-CLOSE_GRACE_MS) throw new Error("Unexpected or open candle");
    return { timestamp: new Date(openTime).toISOString(), openPrice:Number(row[1]), highPrice:Number(row[2]),
      lowPrice:Number(row[3]), closePrice:Number(row[4]), volume:Number(row[5]), emaValue:null, rsiValue:null };
  });
  const normalized = normalizeHistory(rows, limit);
  if (normalized.length !== rows.length) throw new Error("Duplicate or oversized Binance page");
  return normalized;
}

function eventFor(symbol: string, interval: string, c: HistoricalKlineData, snapshot: StrategySnapshot, timely: boolean): SignalOutboxEvent | null {
  const t = Date.parse(c.timestamp);
  const confirmed = snapshot.events.find(e => e.type === "CONFIRMED" && e.timestamp === t);
  if (!confirmed) return null;
  const eventId = symbol+":"+interval+":"+confirmed.direction+":"+t;
  const occurredAt = new Date(t+intervalMilliseconds(interval)).toISOString();
  const deliveryPolicy = signalPolicy(config.alertIntervals.includes(interval), timely);
  const payload = { eventId, id:symbol, symbol, interval, type:"DIVERGENCE_CONFIRMED",
    direction:confirmed.direction, confirmationPrice:confirmed.confirmationPrice,
    rsi:c.rsiValue, ema:c.emaValue, atr:c.atrValue??null, relativeVolume:c.relativeVolume??null,
    candleOpenTime:c.timestamp, signalTime:occurredAt, date:occurredAt, deliveryPolicy,
    strategyVersion:"v3-divergence" };
  return { event_id:eventId, direction:confirmed.direction, occurred_at:occurredAt, payload };
}

async function reconcile(stream: Stream) {
  const {symbol,interval} = stream;
  const step = intervalMilliseconds(interval);
  const target = latestClosedOpen(Date.now(),interval);
  const wasWarm = !!stream.state && !stream.lastError;
  if (!stream.state) {
    const checkpoint = await SupabaseCoinRepository.getSavedSnapshot(symbol,interval);
    if (checkpoint) {
      const prefix = await SupabaseCoinRepository.getHistory(symbol,interval,HISTORY_LIMIT,checkpoint.timestamp);
      stream.state = restoreCheckpoint(prefix,checkpoint,interval);
      stream.lastCandle = Date.parse(checkpoint.timestamp);
    } else {
      const raw = await fetchKlines(symbol,interval,WARMUP_LIMIT,target);
      assertContiguous(raw,interval);
      if (raw.length < HISTORY_LIMIT || Date.parse(raw.at(-1)!.timestamp) !== target) throw new Error("Initial history incomplete");
      const built = buildIndicatorSeries(raw);
      const history = built.history.slice(-HISTORY_LIMIT);
      const snapshot = analyzeStrategy(history,interval,undefined,true);
      // Initial seed establishes a baseline, not a retroactive notification history.
      await SupabaseCoinRepository.persistBatch(symbol,interval,built.history,snapshot,built.state,null,[]);
      stream.state = {history,calculator:built.state};
      stream.lastCandle = target;
    }
  }
  const cursor = Date.parse(stream.state.history.at(-1)!.timestamp);
  const timelyCandidate = wasWarm && target-cursor === step;
  await recoverPages({cursor,target,interval,
    read:(start,end,count)=>fetchKlines(symbol,interval,count,end,start),
    commit:async rows => {
      const current = stream.state!;
      const expected = current.history.at(-1)!.timestamp;
      const replay = replayPage(current,rows,interval);
      const events = replay.processed.flatMap(({candle,snapshot})=>{
        const closeTime=Date.parse(candle.timestamp)+step;
        const timely=timelyCandidate && Date.parse(candle.timestamp)===target && Date.now()-closeTime<=config.allowedLagMs;
        const e=eventFor(symbol,interval,candle,snapshot,timely);
        return e?[e]:[];
      });
      const last = replay.processed.at(-1)!;
      await SupabaseCoinRepository.persistBatch(symbol,interval,replay.processed.map(x=>x.candle),
        last.snapshot,replay.state.calculator,expected,events);
      // Only the committed database checkpoint is authoritative after a failed response.
      stream.state=replay.state;
      stream.lastCandle=Date.parse(last.candle.timestamp);
    }
  });
}

async function discover(): Promise<string[]> {
  if (!config.dynamicSymbols) return config.fallbackSymbols;
  try {
    const tickers=await marketFetch("/api/v3/ticker/24hr");
    if (!Array.isArray(tickers)) throw new Error("Invalid ticker list");
    const selected=tickers.filter((t):t is {symbol:string;quoteVolume:string} =>
      !!t && typeof t.symbol==="string" && /^[A-Z0-9]+USDT$/.test(t.symbol) &&
      t.symbol!=="OMUSDT" && Number.isFinite(Number(t.quoteVolume)) && Number(t.quoteVolume)>=config.minVolume24h)
      .sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume)).slice(0,config.maxSymbols).map(t=>t.symbol);
    if (selected.length) return [...new Set(selected)];
  } catch (e) { console.error("Symbol discovery failed; using fallback",e); }
  return config.fallbackSymbols;
}

async function pollMarkets() {
  if (polling || Date.now()<rateLimitedUntil) return;
  polling=true;
  try {
    const due=streams.filter(s=>s.retryAt<=Date.now());
    let index=0;
    const worker=async()=>{
      while(index<due.length && Date.now()>=rateLimitedUntil) {
        const s=due[index++];
        try {
          await reconcile(s);
          s.failures=0;s.retryAt=0;s.lastError=false;
        } catch(error) {
          // A commit can succeed remotely before a network failure; reload its checkpoint next time.
          s.state=undefined;s.lastError=true;s.failures++;
          s.retryAt=Date.now()+Math.min(120_000,5_000*2**Math.min(s.failures,5))+Math.floor(Math.random()*1000);
          console.error("Market reconciliation failed",s.symbol,s.interval,error);
        }
      }
    };
    await Promise.all(Array.from({length:config.maxConcurrent},worker));
  } finally {polling=false;}
}
function health() {
  const now=Date.now();
  const healthy=streams.filter(s=>!s.lastError && s.lastCandle!=null &&
    s.lastCandle>=latestClosedOpen(now-config.allowedLagMs,s.interval)).length;
  const ready=streams.length>0 && healthy===streams.length;
  return {status:ready?"ready":"degraded",ready,monitoredStreams:streams.length,healthyStreams:healthy,
    staleOrFailedStreams:streams.length-healthy,rateLimited:now<rateLimitedUntil,
    execution:"signals-only",transport:"closed-candle-rest-reconciliation"};
}
async function main(){
  const symbols=await discover();
  for(const symbol of symbols) for(const interval of config.intervals)
    streams.push({symbol,interval,failures:0,retryAt:0,lastError:false});
  const app=express();
  app.get("/live",(_req,res)=>res.json({status:"alive"}));
  app.get("/ready",(_req,res)=>{const h=health();res.status(h.ready?200:503).json(h);});
  app.get("/",(_req,res)=>res.json(health()));
  const port=Number(process.env.API_PORT||3000);
  app.listen(port,()=>console.info("Criypto listening on "+port));
  const poll=()=>void pollMarkets().catch(error=>console.error("Market poll:",error));
  const outbox=()=>void dispatchPendingSignals().catch(error=>console.error("Outbox dispatch:",error));
  poll();outbox();setInterval(poll,config.pollMs);setInterval(outbox,15000);
}
main().catch(error=>{console.error("Fatal startup:",error);process.exit(1);});
