// src/services/CoinService.ts
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
      .limit(12);

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
};
