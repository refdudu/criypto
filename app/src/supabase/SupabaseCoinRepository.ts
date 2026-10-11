import { HistoricalKlineData, Pivot, ArmedDivergence } from "../interfaces";
import { IndicatorAccumulator, normalizeHistory } from "../indicators";
import { supabase } from "./config";

export interface IndicatorSnapshot {
  lastHigh:Pivot|null;lastLow:Pivot|null;armedDivergence:ArmedDivergence|null;
}
export interface StoredSnapshot { timestamp:string; calculator:IndicatorAccumulator }
export interface SignalOutboxEvent {
  event_id:string;direction:"BULLISH"|"BEARISH";occurred_at:string;payload:Record<string,unknown>;
}
function mapCandle(symbol:string,interval:string,c:HistoricalKlineData) {
  return {symbol,interval,timestamp:c.timestamp,open_price:c.openPrice,high_price:c.highPrice,
    low_price:c.lowPrice,close_price:c.closePrice,volume:c.volume??null,
    ema_value:c.emaValue,rsi_value:c.rsiValue,atr_value:c.atrValue??null,
    relative_volume:c.relativeVolume??null};
}
async function getHistory(symbol:string,interval:string,limit:number):Promise<HistoricalKlineData[]>{
  const {data,error}=await supabase.from("market_data").select("*").eq("symbol",symbol).eq("interval",interval)
    .order("timestamp",{ascending:false}).limit(limit);
  if(error)throw error;
  return normalizeHistory((data??[]).map(r=>({
    timestamp:r.timestamp,openPrice:Number(r.open_price),highPrice:Number(r.high_price),
    lowPrice:Number(r.low_price),closePrice:Number(r.close_price),
    volume:r.volume==null?undefined:Number(r.volume),
    emaValue:r.ema_value==null?null:Number(r.ema_value),
    rsiValue:r.rsi_value==null?null:Number(r.rsi_value),
    atrValue:r.atr_value==null?null:Number(r.atr_value),
    relativeVolume:r.relative_volume==null?null:Number(r.relative_volume)
  })),limit);
}
async function getSavedSnapshot(symbol:string,interval:string):Promise<StoredSnapshot|null>{
  const {data,error}=await supabase.from("indicator_states").select("*")
    .eq("symbol",symbol).eq("interval",interval).maybeSingle();
  if(error)throw error;
  if(!data?.calc_state || !data.market_timestamp)return null;
  const s=data.calc_state as IndicatorAccumulator;
  if(!Number.isInteger(s.count)||s.count<15||!Number.isFinite(s.lastClose)||!Array.isArray(s.volumes)||
    !Number.isFinite(s.ema)||!Number.isFinite(s.avgGain)||!Number.isFinite(s.avgLoss)||
    !Number.isFinite(s.atr))return null;
  return {timestamp:data.market_timestamp,calculator:s};
}
async function persistBatch(symbol:string,interval:string,rows:HistoricalKlineData[],
  snapshot:IndicatorSnapshot,calculator:IndicatorAccumulator,event:SignalOutboxEvent|null=null):Promise<void>{
  const newest=rows.at(-1);
  if(!newest)throw new Error("Cannot persist empty batch");
  const state={
    symbol,interval,market_timestamp:newest.timestamp,calc_state:calculator,
    last_high_price:snapshot.lastHigh?.price??null,last_high_rsi:snapshot.lastHigh?.rsi??null,
    last_high_timestamp:snapshot.lastHigh?new Date(snapshot.lastHigh.timestamp).toISOString():null,
    last_low_price:snapshot.lastLow?.price??null,last_low_rsi:snapshot.lastLow?.rsi??null,
    last_low_timestamp:snapshot.lastLow?new Date(snapshot.lastLow.timestamp).toISOString():null,
    armed_divergence_type:snapshot.armedDivergence?.type??null,
    armed_confirmation_price:snapshot.armedDivergence?.confirmationPrice??null,
    armed_at_timestamp:snapshot.armedDivergence?new Date(snapshot.armedDivergence.armedAtTimestamp).toISOString():null
  };
  const {error}=await supabase.rpc("persist_market_batch",{
    p_candles:rows.map(r=>mapCandle(symbol,interval,r)),p_state:state,p_event:event
  });
  if(error)throw error;
}
export interface PendingSignal {
  event_id:string;payload:Record<string,unknown>;delivered_targets:string[];
}
async function getPendingSignals():Promise<PendingSignal[]>{
  const {data,error}=await supabase.from("signal_events")
    .select("event_id,payload,delivered_targets").eq("completed",false)
    .order("created_at",{ascending:true}).limit(100);
  if(error)throw error;
  return data??[];
}
async function markDelivery(eventId:string,targets:string[],complete:boolean){
  const {error}=await supabase.from("signal_events").update({
    delivered_targets:targets,completed:complete
  }).eq("event_id",eventId);
  if(error)throw error;
}
export const SupabaseCoinRepository={getHistory,getSavedSnapshot,persistBatch,getPendingSignals,markDelivery};
