// src/services/CoinService.ts
import { supabase } from "./config"; // Seu cliente Supabase
import type { Dispatch, SetStateAction } from "react";

export interface Coin {
  id: string; // O nome do símbolo, ex: 'BTCUSDT'
  closePrice: number;
  emaValue: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  rsiValue: number;
  timestamp: string;
  intervals: CoinHistoric[];
}

export interface CoinHistoric {
  interval: string;
  coinId: string;
  closePrice: number;
  emaValue: number | null;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  rsiValue: number | null;
  timestamp: string;
}

// Interface para os dados da moeda, alinhada com a tabela 'symbols'

// Mapeia os dados do Supabase (snake_case) para nossa interface (camelCase)
const mapSupabaseToCoin = (data: any, intervals: CoinHistoric[]): Coin => ({
  id: data.symbol,
  closePrice: data.last_close_price,
  emaValue: data.last_ema_value,
  highPrice: data.last_high_price,
  lowPrice: data.last_low_price,
  openPrice: data.last_open_price,
  rsiValue: data.last_rsi_value,
  timestamp: new Date(data.last_timestamp).toLocaleString(),
  intervals: intervals.filter((x) => x.coinId === data.symbol),
});
const mapCoinHistoric: (value: any) => CoinHistoric = (item) => ({
  closePrice: item.close_price,
  emaValue: item.ema_value,
  highPrice: item.high_price,
  lowPrice: item.low_price,
  openPrice: item.open_price,
  rsiValue: item.rsi_value,
  timestamp: item.timestamp,
  coinId: item.symbol,
  interval: item.interval,
});

const getCoinLastInterval = async (): Promise<CoinHistoric[]> => {
  const { data, error } = await supabase.rpc(
    "get_latest_market_data_by_symbol_interval"
  );
  if (error) {
    console.error("Error fetching interval alerts:", error);
    return [];
  }
  const order = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
  return data.map(mapCoinHistoric).sort((a: CoinHistoric, b: CoinHistoric) => {
    return order.indexOf(a.interval) - order.indexOf(b.interval);
  });
};

export const SupabaseCoinService = {
  /**
   * Busca os dados iniciais das moedas e inicia uma escuta em tempo real para atualizações.
   * @param setCoins A função de estado do React para atualizar a lista de moedas.
   * @returns A inscrição do canal em tempo real para que possa ser cancelada depois.
   */
  getCoins: async (): Promise<Coin[]> => {
    // 1. Busca inicial dos dados
    const { data: initialData, error } = await supabase
      .from("symbols")
      .select("*")
      .order("last_timestamp", { ascending: false });
    //   .limit(50);

    if (error) {
      console.error("Error fetching initial coins:", error);
      return [];
    }
    const data = await getCoinLastInterval();
    console.log("🚀 ~ getCoins: ~ data:", data);

    if (initialData) {
      const initialCoins = initialData.map((x) => mapSupabaseToCoin(x, data));
      return initialCoins;
    }
    return [];
  },
  getCoinLastInterval,
  //   watchCoins: (setCoins: Dispatch<SetStateAction<Coin[]>>) => {
  //     const channel = supabase
  //       .channel("custom-all-channel")
  //       .on(
  //         "postgres_changes",
  //         { event: "*", schema: "public", table: "symbols" },
  //         (payload) => {
  //           const updatedCoin = mapSupabaseToCoin(payload.new, []);
  //           setCoins((prevCoins) => {
  //             const existingCoinIndex = prevCoins.find(
  //               (coin) => coin.id === updatedCoin.id
  //             );
  //             if (existingCoinIndex) {
  //               return prevCoins.map((coin) =>
  //                 coin.id === updatedCoin.id ? updatedCoin : coin
  //               );
  //             } else {
  //               return [...prevCoins, updatedCoin];
  //             }
  //           });
  //         }
  //       )
  //       .subscribe();

  //     return channel;
  //   },
  getIntervalsAlert: async (): Promise<CoinHistoric[]> => {
    const { data, error } = await supabase
      .from("market_data")
      .select("rsi_value,timestamp,symbol,interval,close_price,ema_value")
      .not("interval", "eq", "1m")
      .or("rsi_value.lt.35,rsi_value.gt.70")
      .limit(200)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Error fetching interval alerts:", error);
      return [];
    }

    return data.map(mapCoinHistoric);
  },

  watchIntervals: (
    setRciHistoric: Dispatch<SetStateAction<CoinHistoric[]>>,
    setCoins: Dispatch<SetStateAction<Coin[]>>
  ) => {
    console.log("watch");
    const channel = supabase
      .channel("rsi-alert-channel-filter")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "market_data",
          //   filter: "interval=neq.1m",
        },
        (payload) => {
          const { new: newData } = payload;
          if (!newData) return;

          setCoins((p) => {
            return p.map((x) => {
              if (x.id === newData.symbol) {
                return {
                  ...x,
                  intervals: x.intervals.map((y) => {
                    if (y.interval === newData.interval)
                      return mapCoinHistoric(newData);
                    return y;
                  }),
                };
              }
              return x;
            });
          });

          if (newData.interval === "1m") return;
          if (
            newData.rsi_value === null ||
            (newData.rsi_value >= 35 && newData.rsi_value <= 70)
          )
            return;

          const historicData = mapCoinHistoric(newData);
          setRciHistoric((p) => [historicData, ...p]);
        }
      )
      .subscribe((x) => {
        console.log(x);
      }, 999999);

    return channel;
  },
};
