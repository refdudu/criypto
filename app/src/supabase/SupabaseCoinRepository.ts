// src/CoinRepository.ts
import { supabase } from "./config";

// Interface for the kline data (can be shared across your app)
export interface HistoricalKlineData {
  emaValue: number;
  rsiValue: number | null;
  closePrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  timestamp: string;
}

/**
 * Loads the last 14 kline data points for a given symbol and interval.
 * @param symbol The coin symbol (e.g., 'BTCUSDT').
 * @param interval The timeframe (e.g., '1m', '5m').
 * @returns A promise that resolves to an array of historical data.
 */
async function loadSymbolIntervalDataFromSupabase(
  symbol: string,
  interval: string
): Promise<HistoricalKlineData[]> {
  const { data, error } = await supabase
    .from("market_data") // Select from the 'market_data' table
    .select(
      "ema_value, rsi_value, close_price, open_price, high_price, low_price, timestamp"
    ) // Select specific columns
    .eq("symbol", symbol) // WHERE symbol = 'BTCUSDT'
    .eq("interval", interval) // AND interval = '1m'
    .order("timestamp", { ascending: false }) // ORDER BY timestamp DESC
    .limit(14); // LIMIT 14

  if (error) {
    console.error(
      `Error loading data for ${symbol}@${interval} from Supabase:`,
      error
    );
    throw error;
  }

  // Map from snake_case (database) to camelCase (JS interface)
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

/**
 * Saves a new kline data point to the historical log and updates the symbol summary.
 * @param symbol The coin symbol.
 * @param interval The timeframe.
 * @param klineDataForHistory The new kline data to save.
 */
async function saveSymbolIntervalDataToSupabase(
  symbol: string,
  interval: string,
  klineDataForHistory: HistoricalKlineData
): Promise<void> {
  try {
    // 1. Insert the new detailed kline data into the 'market_data' table
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

    // 2. Fetch the current symbol's summary data to update its intervals array
    const { data: currentSymbol, error: fetchError } = await supabase
      .from("symbols")
      .select("intervals")
      .eq("symbol", symbol)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // Ignore 'Range not satisfactory' error for no-rows-found
      console.error("Error fetching symbol for update:", fetchError);
      throw fetchError;
    }

    const existingIntervals = currentSymbol?.intervals || [];
    const newIntervals = existingIntervals.includes(interval)
      ? existingIntervals
      : [...existingIntervals, interval];

    // 3. Prepare the data for the 'symbols' table upsert
    // An upsert will create the row if it doesn't exist, or update it if it does.
    const summaryData: any = {
      symbol: symbol,
      intervals: newIntervals,
    };

    // If the interval is '1m', update the 'last_' fields with the latest data
    if (interval === "1m") {
      summaryData.last_timestamp = new Date().toISOString();
      summaryData.last_close_price = klineDataForHistory.closePrice;
      summaryData.last_open_price = klineDataForHistory.openPrice;
      summaryData.last_high_price = klineDataForHistory.highPrice;
      summaryData.last_low_price = klineDataForHistory.lowPrice;
      summaryData.last_ema_value = klineDataForHistory.emaValue;
      summaryData.last_rsi_value = klineDataForHistory.rsiValue;
    }

    // 4. Upsert the summary data into the 'symbols' table
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

// Export the repository object with the new Supabase functions
export const SupabaseCoinRepository = {
  loadSymbolIntervalData: loadSymbolIntervalDataFromSupabase,
  saveSymbolIntervalData: saveSymbolIntervalDataToSupabase,
};
