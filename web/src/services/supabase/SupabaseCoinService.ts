import { supabase } from "./config";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface IndicatorState {
  symbol: string; interval: string; updated_at: string;
  last_high_price: number | null; last_high_rsi: number | null;
  last_high_timestamp: string | null; last_low_price: number | null;
  last_low_rsi: number | null; last_low_timestamp: string | null;
  armed_divergence_type: string | null; armed_confirmation_price: number | null;
  armed_at_timestamp: string | null;
}
export interface CoinHistoric {
  interval: string; coinId: string; closePrice: number;
  emaValue: number | null; highPrice: number; lowPrice: number;
  openPrice: number; rsiValue: number | null; timestamp: string;
}
export interface Coin {
  id: string; closePrice: number; emaValue: number | null;
  highPrice: number; lowPrice: number; openPrice: number;
  rsiValue: number | null; timestamp: string; intervals: CoinHistoric[];
  indicator_states: IndicatorState[];
}
const mapHistoric = (r: Record<string, unknown>): CoinHistoric => ({
  coinId: String(r.symbol), interval: String(r.interval), timestamp: String(r.timestamp),
  closePrice: Number(r.close_price), highPrice: Number(r.high_price),
  lowPrice: Number(r.low_price), openPrice: Number(r.open_price),
  emaValue: r.ema_value == null ? null : Number(r.ema_value),
  rsiValue: r.rsi_value == null ? null : Number(r.rsi_value)
});
async function getIndicatorStates(): Promise<IndicatorState[]> {
  const { data, error } = await supabase.from("indicator_states").select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
async function getCoins(): Promise<Coin[]> {
  const { data, error } = await supabase.from("symbols").select("*")
    .order("last_timestamp", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).filter(item => item.last_timestamp != null).map(item => ({
    id: item.symbol, closePrice: Number(item.last_close_price),
    emaValue: item.last_ema_value == null ? null : Number(item.last_ema_value),
    highPrice: Number(item.last_high_price), lowPrice: Number(item.last_low_price),
    openPrice: Number(item.last_open_price),
    rsiValue: item.last_rsi_value == null ? null : Number(item.last_rsi_value),
    timestamp: item.last_timestamp, intervals: [],
    indicator_states: []
  }));
}
async function getHistory(symbol: string, interval: string): Promise<CoinHistoric[]> {
  const { data, error } = await supabase.from("market_data")
    .select("symbol,interval,timestamp,open_price,high_price,low_price,close_price,ema_value,rsi_value")
    .eq("symbol", symbol).eq("interval", interval)
    .order("timestamp", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(mapHistoric).reverse();
}
async function getIntervalsAlert(): Promise<CoinHistoric[]> {
  const { data, error } = await supabase.from("market_data")
    .select("symbol,interval,timestamp,open_price,high_price,low_price,close_price,ema_value,rsi_value")
    .or("rsi_value.lt.30,rsi_value.gt.70")
    .order("timestamp", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(mapHistoric);
}
function watch(onChange: () => void): RealtimeChannel {
  return supabase.channel("criypto-dashboard")
    .on("postgres_changes", { event: "*", schema: "public", table: "indicator_states" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "symbols" }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "market_data" }, onChange)
    .subscribe();
}
export const SupabaseCoinService = { getIndicatorStates, getCoins, getHistory, getIntervalsAlert, watch };
