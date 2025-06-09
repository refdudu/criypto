// src/services/CoinService.ts
import type { CoinHistoric } from "../CoinService";
import { supabase } from "./config"; // Seu cliente Supabase
import type { Dispatch, SetStateAction } from "react";

// Interface para os dados da moeda, alinhada com a tabela 'symbols'
export interface Coin {
  id: string; // O nome do símbolo, ex: 'BTCUSDT'
  closePrice: number;
  emaValue: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  rsiValue: number;
  timestamp: string;
  intervals: string[];
}

// Mapeia os dados do Supabase (snake_case) para nossa interface (camelCase)
const mapSupabaseToCoin = (data: any): Coin => ({
  id: data.symbol,
  closePrice: data.last_close_price,
  emaValue: data.last_ema_value,
  highPrice: data.last_high_price,
  lowPrice: data.last_low_price,
  openPrice: data.last_open_price,
  rsiValue: data.last_rsi_value,
  timestamp: new Date(data.last_timestamp).toLocaleString(),
  intervals: data.intervals,
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
      .order("last_timestamp", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching initial coins:", error);
      return [];
    }

    if (initialData) {
      const initialCoins = initialData.map(mapSupabaseToCoin);
      return initialCoins;
    }
    return [];
  },
  watchCoins: (setCoins: Dispatch<SetStateAction<Coin[]>>) => {
    const channel = supabase
      .channel("custom-all-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "symbols" },
        (payload) => {
          const updatedCoin = mapSupabaseToCoin(payload.new);
          setCoins((prevCoins) => {
            const existingCoinIndex = prevCoins.find(
              (coin) => coin.id === updatedCoin.id
            );
            if (existingCoinIndex) {
              return prevCoins.map((coin) =>
                coin.id === updatedCoin.id ? updatedCoin : coin
              );
            } else {
              return [...prevCoins, updatedCoin];
            }
          });
        }
      )
      .subscribe();

    return channel;
  },
  getIntervalsAlert: async (): Promise<CoinHistoric[]> => {
    const { data, error } = await supabase
      .from("market_data")
      .select("*")
      .not("interval", "eq", "1m")
      .or("rsi_value.lt.35,rsi_value.gt.70")
      .limit(50)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Error fetching interval alerts:", error);
      return [];
    }

    return data.map(mapCoinHistoric);
  },
  watchIntervals: (
    setRciHistoric: Dispatch<SetStateAction<CoinHistoric[]>>
  ) => {
    const channel = supabase
      .channel("rci-alert-channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "market_data",
            filter: "interval=neq.1m,or(rsi_value=lt.35,rsi_value=gt.70)",
        },
        (payload) => {
          const { new: newData } = payload;
          if (!newData) return;
          const historicData = mapCoinHistoric(newData);
          setRciHistoric((p) => [historicData, ...p]);
        }
      )
      .subscribe();

    return channel;
  },
};
