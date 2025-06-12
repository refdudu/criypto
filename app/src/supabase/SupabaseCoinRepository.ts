import { HistoricalKlineData, ObserveSymbolStatusEnum } from "../interfaces";
import { supabase } from "./config";

async function loadSymbolIntervalDataFromSupabase(
  symbol: string,
  interval: string
): Promise<HistoricalKlineData[]> {
  const { data, error } = await supabase
    .from("market_data")
    .select(
      "ema_value, rsi_value, close_price, open_price, high_price, low_price, timestamp"
    )
    .eq("symbol", symbol)
    .eq("interval", interval)
    .order("timestamp", { ascending: false })
    .limit(14);

  if (error) {
    console.error(
      `Error loading data for ${symbol}@${interval} from Supabase:`,
      error
    );
    throw error;
  }

  return data.map((item) => ({
    emaValue: item.ema_value,
    rsiValue: item.rsi_value,
    closePrice: item.close_price,
    openPrice: item.open_price,
    highPrice: item.high_price,
    lowPrice: item.low_price,
    timestamp: item.timestamp,
  }));
}

async function saveSymbolIntervalDataToSupabase(
  symbol: string,
  interval: string,
  klineDataForHistory: HistoricalKlineData
): Promise<void> {
  try {
    const insertError = await supabase.from("market_data").insert({
      symbol,
      interval,
      ema_value: klineDataForHistory.emaValue,
      rsi_value: klineDataForHistory.rsiValue,
      close_price: klineDataForHistory.closePrice,
      open_price: klineDataForHistory.openPrice,
      high_price: klineDataForHistory.highPrice,
      low_price: klineDataForHistory.lowPrice,
      timestamp: new Date().toISOString(),
    });

    if (insertError.error) {
      console.error(
        "Error inserting historical kline data:",
        insertError.error
      );
      throw insertError.error;
    }

    const { data: currentSymbol, error: fetchError } = await supabase
      .from("symbols")
      .select("intervals")
      .eq("symbol", symbol)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching symbol for update:", fetchError);
      throw fetchError;
    }

    const summaryData: any = {
      symbol: symbol,
    };

    if (interval === "5m") {
      summaryData.last_timestamp = new Date().toISOString();
      summaryData.last_close_price = klineDataForHistory.closePrice;
      summaryData.last_open_price = klineDataForHistory.openPrice;
      summaryData.last_high_price = klineDataForHistory.highPrice;
      summaryData.last_low_price = klineDataForHistory.lowPrice;
      summaryData.last_ema_value = klineDataForHistory.emaValue;
      summaryData.last_rsi_value = klineDataForHistory.rsiValue;
    }

    const { error: upsertError } = await supabase
      .from("symbols")
      .upsert(summaryData);

    if (upsertError) {
      console.error("Error upserting symbol summary data:", upsertError);
      throw upsertError;
    }
  } catch (error) {
    console.error(
      `Failed to save state for ${symbol}@${interval} to Supabase:`,
      error
    );
  }
}
async function createSymbolObserve(symbol: string): Promise<void> {
  const insertResponse = await supabase.from("symbols_observe").insert({
    symbol,
    status: ObserveSymbolStatusEnum.observing,
  });
  if (insertResponse.error) throw new Error(insertResponse.error.message);

  console.log(`Symbol ${symbol} is now being observed.`);
}
async function getSymbolObserve(symbol: string): Promise<boolean> {
  const response = await supabase
  .from("symbols_observe")
  .select("*")
  // .eq("symbol", symbol)
  .eq("status", ObserveSymbolStatusEnum.observing)
  .limit(1)
  .single();

  if (!response.error && response.data) return true;
  return false;
}

export const SupabaseCoinRepository = {
  loadSymbolIntervalData: loadSymbolIntervalDataFromSupabase,
  saveSymbolIntervalData: saveSymbolIntervalDataToSupabase,
  createSymbolObserve,
  getSymbolObserve,
};
