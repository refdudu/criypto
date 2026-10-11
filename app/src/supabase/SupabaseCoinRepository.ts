import { HistoricalKlineData, Pivot, ArmedDivergence } from "../interfaces";
import { normalizeHistory } from "../indicators";
import { supabase } from "./config";

export interface IndicatorSnapshot {
  lastHigh: Pivot | null;
  lastLow: Pivot | null;
  armedDivergence: ArmedDivergence | null;
}
async function getHistory(symbol: string, interval: string, limit: number): Promise<HistoricalKlineData[]> {
  const { data, error } = await supabase.from("market_data")
    .select("timestamp,open_price,high_price,low_price,close_price,ema_value,rsi_value")
    .eq("symbol", symbol).eq("interval", interval)
    .order("timestamp", { ascending: false }).limit(limit);
  if (error) throw error;
  return normalizeHistory((data ?? []).map(row => ({
    timestamp: row.timestamp, openPrice: Number(row.open_price), highPrice: Number(row.high_price),
    lowPrice: Number(row.low_price), closePrice: Number(row.close_price),
    emaValue: row.ema_value, rsiValue: row.rsi_value
  })), limit);
}
async function saveSymbolIntervalData(symbol: string, interval: string, row: HistoricalKlineData): Promise<void> {
  // One sequential writer per process. Prevent duplicate records after reconnects/restarts.
  const { data: existing, error: lookupError } = await supabase.from("market_data")
    .select("timestamp").eq("symbol", symbol).eq("interval", interval)
    .eq("timestamp", row.timestamp).limit(1);
  if (lookupError) throw lookupError;
  if (!existing?.length) {
    const { error } = await supabase.from("market_data").insert({
      symbol, interval, timestamp: row.timestamp, open_price: row.openPrice,
      high_price: row.highPrice, low_price: row.lowPrice, close_price: row.closePrice,
      ema_value: row.emaValue, rsi_value: row.rsiValue
    });
    if (error) throw error;
  }
  if (interval === "5m") {
    const { error } = await supabase.from("symbols").upsert({
      symbol, last_timestamp: row.timestamp, last_open_price: row.openPrice,
      last_high_price: row.highPrice, last_low_price: row.lowPrice,
      last_close_price: row.closePrice, last_ema_value: row.emaValue,
      last_rsi_value: row.rsiValue
    }, { onConflict: "symbol" });
    if (error) throw error;
  }
}
async function updateIndicatorState(symbol: string, interval: string, snapshot: IndicatorSnapshot): Promise<void> {
  const { lastHigh, lastLow, armedDivergence } = snapshot;
  const { error } = await supabase.from("indicator_states").upsert({
    symbol, interval,
    last_high_price: lastHigh?.price ?? null, last_high_rsi: lastHigh?.rsi ?? null,
    last_high_timestamp: lastHigh ? new Date(lastHigh.timestamp).toISOString() : null,
    last_low_price: lastLow?.price ?? null, last_low_rsi: lastLow?.rsi ?? null,
    last_low_timestamp: lastLow ? new Date(lastLow.timestamp).toISOString() : null,
    armed_divergence_type: armedDivergence?.type ?? null,
    armed_confirmation_price: armedDivergence?.confirmationPrice ?? null,
    armed_at_timestamp: armedDivergence ? new Date(armedDivergence.armedAtTimestamp).toISOString() : null,
    updated_at: new Date().toISOString()
  }, { onConflict: "symbol,interval" });
  if (error) throw error;
}
export const SupabaseCoinRepository = { getHistory, saveSymbolIntervalData, updateIndicatorState };
