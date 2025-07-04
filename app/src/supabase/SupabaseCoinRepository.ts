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

  // 1. Busca o histórico de velas (como antes)
  const { data: klineData, error: klineError } = await supabase.rpc(
    "get_latest_market_data_for_symbols",
    {
      symbols_to_fetch: symbols,
      intervals_to_fetch: intervals,
      limit_per_group: limit,
    }
  );

  if (klineError) {
    console.error(
      "Erro ao carregar dados históricos do Supabase via RPC:",
      klineError
    );
    throw klineError;
  }

  const data = klineData as CoinHistoricSupabase[];
  if (!data || data.length === 0) {
    console.warn(
      "Nenhum dado histórico encontrado. O estado será inicializado vazio."
    );
  }

  console.log(
    `Recebidos ${data.length} registros de velas. Agrupando agora...`
  );

  const groupedState: DataSymbolsState = {};

  // Inicializa a estrutura do estado para todos os símbolos e intervalos
  for (const symbol of symbols) {
    groupedState[symbol] = {};
    for (const interval of intervals) {
      groupedState[symbol][interval] = {
        closePrices: [],
        emaHistory: [],
        previousAverageGain: null,
        previousAverageLoss: null,
        rsiValue: null,
        // Inicializa os campos de divergência
        lastHighPrice: null,
        lastHighRsi: null,
        lastLowPrice: null,
        lastLowRsi: null,
      };
    }
  }

  // Preenche o estado com os dados das velas
  data.forEach((item) => {
    const { symbol, interval } = item;
    if (groupedState[symbol] && groupedState[symbol][interval]) {
      groupedState[symbol][interval].closePrices.push(item.close_price);
      if (item.ema_value) {
        groupedState[symbol][interval].emaHistory.push(item.ema_value);
      }
    }
  });

  // 2. Busca o estado salvo dos indicadores (picos e vales) da nova tabela
  console.log("Buscando estados de indicadores salvos (picos/vales)...");
  const { data: indicatorStatesData, error: stateError } = await supabase
    .from("indicator_states")
    .select(
      "symbol, interval, last_high_price, last_high_rsi, last_low_price, last_low_rsi"
    )
    .in("symbol", symbols);

  if (stateError) {
    console.error("Erro ao carregar estados de indicadores:", stateError);
    // Não lançamos um erro aqui, podemos continuar com o estado zerado
  }

  // 3. Mescla o estado salvo no objeto de estado principal
  if (indicatorStatesData) {
    indicatorStatesData.forEach((state) => {
      const {
        symbol,
        interval,
        last_high_price,
        last_high_rsi,
        last_low_price,
        last_low_rsi,
      } = state;
      if (groupedState[symbol] && groupedState[symbol][interval]) {
        console.log(`Estado salvo encontrado para ${symbol}@${interval}.`);
        groupedState[symbol][interval].lastHighPrice = last_high_price;
        groupedState[symbol][interval].lastHighRsi = last_high_rsi;
        groupedState[symbol][interval].lastLowPrice = last_low_price;
        groupedState[symbol][interval].lastLowRsi = last_low_rsi;
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

async function updateIndicatorState(
  symbol: string,
  interval: string,
  state: Partial<SymbolTimeframeIndicatorState>
): Promise<void> {
  const updateData = {
    symbol,
    interval,
    last_high_price: state.lastHighPrice,
    last_high_rsi: state.lastHighRsi,
    last_low_price: state.lastLowPrice,
    last_low_rsi: state.lastLowRsi,
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
  interval: string // NOVO PARÂMETRO
): Promise<any> {
  const { data, error } = await supabase.rpc("get_recent_rsi_alerts", {
    p_symbol: symbol,
    p_interval: interval, // NOVO PARÂMETRO
  });

  if (error) {
    console.error("Erro ao chamar a função get_recent_rsi_alerts:", error);
    return null;
  }
  if (data.length === 0) return null;
  return data;
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
  updateIndicatorState,
};
