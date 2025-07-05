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

  // 1. Busca o histórico de velas
  const { data: klineData, error: klineError } = await supabase.rpc(
    "get_latest_market_data_for_symbols",
    {
      symbols_to_fetch: symbols,
      intervals_to_fetch: intervals,
      limit_per_group: limit,
    }
  );

  if (klineError) throw klineError;

  const groupedState: DataSymbolsState = {};

  // 2. Inicializa a estrutura do estado
  for (const symbol of symbols) {
    groupedState[symbol] = {};
    for (const interval of intervals) {
      groupedState[symbol][interval] = {
        klineHistory: [],
        previousAverageGain: null,
        previousAverageLoss: null,
        rsiValue: null,
        emaValue: null,
        lastHigh: null,
        lastLow: null,
        armedDivergence: null,
        closePrices: [],
        emaHistory: [],
        lastHighPrice: null,
        lastHighRsi: null,
        lastLowPrice: null,
        lastLowRsi: null,
      };
    }
  }

  // 3. Preenche o estado com os dados das velas
  (klineData || []).forEach((item: any) => {
    const { symbol, interval } = item;
    if (groupedState[symbol] && groupedState[symbol][interval]) {
      groupedState[symbol][interval].klineHistory.unshift({
        // unshift para manter em ordem cronológica
        closePrice: item.close_price,
        openPrice: item.open_price,
        highPrice: item.high_price,
        lowPrice: item.low_price,
        emaValue: item.ema_value,
        rsiValue: item.rsi_value,
        timestamp: item.timestamp,
      });
    }
  });

  // 4. Busca o estado salvo dos indicadores
  console.log("Buscando estados de indicadores salvos...");
  const { data: indicatorStatesData, error: stateError } = await supabase
    .from("indicator_states")
    .select("*")
    .in("symbol", symbols);

  if (stateError) {
    console.error("Erro ao carregar estados de indicadores:", stateError);
  }

  // 5. Mescla o estado salvo
  if (indicatorStatesData) {
    indicatorStatesData.forEach((state) => {
      const {
        symbol,
        interval,
        last_high_price,
        last_high_rsi,
        last_high_timestamp,
        last_low_price,
        last_low_rsi,
        last_low_timestamp,
        armed_divergence_type,
        armed_confirmation_price,
        armed_at_timestamp,
      } = state;
      if (groupedState[symbol] && groupedState[symbol][interval]) {
        if (last_high_price && last_high_rsi && last_high_timestamp) {
          groupedState[symbol][interval].lastHigh = {
            price: last_high_price,
            rsi: last_high_rsi,
            timestamp: new Date(last_high_timestamp).getTime(),
          };
        }
        if (last_low_price && last_low_rsi && last_low_timestamp) {
          groupedState[symbol][interval].lastLow = {
            price: last_low_price,
            rsi: last_low_rsi,
            timestamp: new Date(last_low_timestamp).getTime(),
          };
        }
        if (
          armed_divergence_type &&
          armed_confirmation_price &&
          armed_at_timestamp
        ) {
          groupedState[symbol][interval].armedDivergence = {
            type: armed_divergence_type as "BULLISH" | "BEARISH",
            confirmationPrice: armed_confirmation_price,
            armedAtTimestamp: new Date(armed_at_timestamp).getTime(),
          };
        }
      }
    });
  }

  console.log("Estado inicial carregado com sucesso.");
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
    // Use the timestamp from the kline data for accuracy. Fallback to now() if not present.
    const timestampToSave = klineDataForHistory.timestamp
      ? new Date(klineDataForHistory.timestamp).toISOString()
      : new Date().toISOString();

    const { error: insertError } = await supabase.from("market_data").insert({
      symbol,
      interval,
      ema_value: klineDataForHistory.emaValue,
      rsi_value: klineDataForHistory.rsiValue,
      close_price: klineDataForHistory.closePrice,
      open_price: klineDataForHistory.openPrice,
      high_price: klineDataForHistory.highPrice,
      low_price: klineDataForHistory.lowPrice,
      timestamp: timestampToSave, // Use the correct timestamp from the kline data
    });

    if (insertError) {
      console.error("Error inserting historical kline data:", insertError);
      throw insertError;
    }

    const summaryData: any = {
      symbol: symbol,
    };

    if (interval === "5m") {
      summaryData.last_timestamp = timestampToSave;
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

async function updateIndicatorState(
  symbol: string,
  interval: string,
  state: Partial<SymbolTimeframeIndicatorState>
): Promise<void> {
  const updateData = {
    symbol,
    interval,
    last_high_price: state.lastHigh?.price,
    last_high_rsi: state.lastHigh?.rsi,
    last_high_timestamp: state.lastHigh
      ? new Date(state.lastHigh.timestamp).toISOString()
      : null,
    last_low_price: state.lastLow?.price,
    last_low_rsi: state.lastLow?.rsi,
    last_low_timestamp: state.lastLow
      ? new Date(state.lastLow.timestamp).toISOString()
      : null,
    armed_divergence_type: state.armedDivergence?.type,
    armed_confirmation_price: state.armedDivergence?.confirmationPrice,
    armed_at_timestamp: state.armedDivergence
      ? new Date(state.armedDivergence.armedAtTimestamp).toISOString()
      : null,
  };

  const { error } = await supabase.from("indicator_states").upsert(updateData, {
    onConflict: "symbol,interval",
  });

  if (error) {
    console.error(
      `Erro ao salvar estado do indicador para ${symbol}@${interval}:`,
      error
    );
    throw error;
  }
}
async function checkRecentRsiAlerts(
  symbol: string,
  interval: string
): Promise<any> {
  const { data, error } = await supabase.rpc("get_recent_rsi_alerts", {
    p_symbol: symbol,
    p_interval: interval,
  });

  if (error) {
    console.error("Erro ao chamar a função get_recent_rsi_alerts:", error);
    return null;
  }
  if (data.length === 0) return null;
  return data;
}

async function createSymbolObserve(symbol: string): Promise<void> {
  const { error } = await supabase.from("symbols_observe").upsert(
    {
      symbol,
      status: ObserveSymbolStatusEnum.observing,
    },
    { onConflict: "symbol" } // Assumes 'symbol' is the primary key or has a UNIQUE constraint
  );

  if (error) {
    console.error(`Error upserting symbol ${symbol} to observe list:`, error);
    throw new Error(error.message);
  }

  console.log(`Symbol ${symbol} is now being observed (or was already).`);
}

export const SupabaseCoinRepository = {
  saveSymbolIntervalData: saveSymbolIntervalDataToSupabase,
  createSymbolObserve,
  loadInitialStateForAllSymbols,
  getLastCoinHistoric,
  checkRecentRsiAlerts,
  updateIndicatorState,
};
