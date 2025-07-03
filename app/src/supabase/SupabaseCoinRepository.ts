import {
  HistoricalKlineData,
  ObserveSymbolStatusEnum,
  SymbolTimeframeIndicatorState,
} from "../interfaces";
import { supabase } from "./config";

export type DataSymbolsState = Record<
  string,
  Record<string, SymbolTimeframeIndicatorState>
>;

export interface CoinHistoricSupabase {
  id: string;
  interval: string;
  symbol: string;
  close_price: number;
  ema_value: number | null;
  high_price: number;
  low_price: number;
  open_price: number;
  rsi_value: number | null;
  timestamp: string;
}

async function loadInitialStateForAllSymbols(
  symbols: string[],
  intervals: string[],
  limit: number
): Promise<DataSymbolsState> {
  console.log(`Buscando dados iniciais para ${symbols.length} símbolos...`);
  const { data: _data, error } = await supabase.rpc(
    "get_latest_market_data_for_symbols",
    {
      symbols_to_fetch: symbols,
      intervals_to_fetch: intervals,
      limit_per_group: limit,
    }
  );

  if (error) {
    console.error(
      "Erro ao carregar dados iniciais do Supabase via RPC:",
      error
    );
    throw error;
  }
  const data = _data as CoinHistoricSupabase[];
  if (!data || data.length === 0) {
    throw new Error(
      "Nenhum dado histórico encontrado para os símbolos e intervalos fornecidos."
    );
  }

  console.log(
    `Recebidos ${data.length} registros do banco. Agrupando agora...`
  );

  const groupedState = data.reduce((acc: DataSymbolsState, item) => {
    const { symbol, interval } = item;

    const klineData: HistoricalKlineData = {
      emaValue: item.ema_value,
      rsiValue: item.rsi_value,
      closePrice: item.close_price,
      openPrice: item.open_price,
      highPrice: item.high_price,
      lowPrice: item.low_price,
      timestamp: item.timestamp,
    };

    if (!acc[symbol]) {
      acc[symbol] = {};
    }

    if (!acc[symbol][interval]) {
      acc[symbol][interval] = {
        closePrices: [],
        emaHistory: [],
        previousAverageGain: null,
        previousAverageLoss: null,
        rsiValue: null,
      };
    }

    acc[symbol][interval].closePrices.push(klineData.closePrice);

    if (klineData.emaValue) {
      acc[symbol][interval].emaHistory.push(klineData.emaValue);
    }

    return acc;
  }, {});

  return groupedState;
}
async function getLastCoinHistoric(
  symbol: string,
  interval: string
): Promise<HistoricalKlineData> {
  const { data, error } = await supabase
    .from("market_data")
    .select(
      "ema_value, rsi_value, close_price, open_price, high_price, low_price, timestamp"
    )
    .eq("symbol", symbol)
    .eq("interval", interval)
    .limit(1)
    .single();

  if (error) {
    console.error(
      `Error loading data for ${symbol}@${interval} from Supabase:`,
      error
    );
    throw error;
  }
  return {
    emaValue: data.ema_value,
    rsiValue: data.rsi_value,
    closePrice: data.close_price,
    openPrice: data.open_price,
    highPrice: data.high_price,
    lowPrice: data.low_price,
    timestamp: data.timestamp,
  };
}
// async function getIsSended(
//   symbol: string,
//   interval: string
// ): Promise<HistoricalKlineData | null> {
//   // Calcula o timestamp de 4 horas atrás
//   const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

//   const { data, error } = await supabase
//     .from("market_data")
//     .select(
//       "ema_value, rsi_value, close_price, open_price, high_price, low_price, timestamp"
//     )
//     .eq("symbol", symbol)
//     .eq("interval", interval)
//     .gte("timestamp", fourHoursAgo)
//     .or("rsi_value.gt.70,rsi_value.lt.30")
//     .order("timestamp", { ascending: false })
//     .limit(1)
//     .single();

//   if (error) {
//     if (error.code === "PGRST116" || error.message?.includes("No rows")) {
//       return null;
//     }
//     console.error(
//       `Error loading data for ${symbol}@${interval} from Supabase:`,
//       error
//     );
//     throw error;
//   }
//   if (!data) {
//     return null;
//   }
//   return {
//     emaValue: data.ema_value,
//     rsiValue: data.rsi_value,
//     closePrice: data.close_price,
//     openPrice: data.open_price,
//     highPrice: data.high_price,
//     lowPrice: data.low_price,
//     timestamp: data.timestamp,
//   };
// }

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
async function checkRecentRsiAlerts(
  symbol: string,
  interval: string // NOVO PARÂMETRO
): Promise<any> {
  const { data, error } = await supabase.rpc("get_recent_rsi_alerts", {
    p_symbol: symbol,
    p_interval: interval, // NOVO PARÂMETRO
  });

  if (error) {
    console.error("Erro ao chamar a função get_recent_rsi_alerts:", error);
    throw null;
  }
  if (data.length === 0) throw error;
  return data
}

async function createSymbolObserve(symbol: string): Promise<void> {
  const insertResponse = await supabase.from("symbols_observe").insert({
    symbol,
    status: ObserveSymbolStatusEnum.observing,
  });
  if (insertResponse.error) throw new Error(insertResponse.error.message);

  console.log(`Symbol ${symbol} is now being observed.`);
}

export const SupabaseCoinRepository = {
  saveSymbolIntervalData: saveSymbolIntervalDataToSupabase,
  createSymbolObserve,
  loadInitialStateForAllSymbols,
  getLastCoinHistoric,
  checkRecentRsiAlerts,
};
