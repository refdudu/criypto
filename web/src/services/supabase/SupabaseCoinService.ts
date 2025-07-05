import { supabase } from "./config";
import type { Dispatch, SetStateAction } from "react";

export interface Coin {
  id: string;
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
  const order = ["5m", "15m", "30m", "1h", "4h", "1d"];
  return data.map(mapCoinHistoric).sort((a: CoinHistoric, b: CoinHistoric) => {
    return order.indexOf(a.interval) - order.indexOf(b.interval);
  });
};

const getAllCoinsWithLastIndicatorState = async () => {
  const { data, error } = await supabase
    .from("distinct_coins_with_latest_indicator")
    .select("*");

  if (error) {
    console.error("Error fetching coins:", error);
    return [];
  }

  return data as Coin[];
};
const getAllCoinsWithIndicatorStates = async () => {
  const { data, error } = await supabase
    .from("coins")
    .select("*, indicator_states(*)")
    .order("created_at", { ascending: false })
    .order("timestamp", { foreignTable: "indicator_states", ascending: false });

  if (error) {
    console.error("Error fetching coins with all indicator states:", error);
    return [];
  }

  return data as Coin[];
};
const getIntervalsAlert = async (): Promise<CoinHistoric[]> => {
  const { data, error } = await supabase
    .from("market_data")
    .select("rsi_value,timestamp,symbol,interval,close_price,ema_value")
    .or("rsi_value.lt.35,rsi_value.gt.70")
    .limit(200)
    .order("timestamp", { ascending: false });

  if (error) {
    console.error("Error fetching interval alerts:", error);
    return [];
  }

  return data.map(mapCoinHistoric);
};
const getCoins = async (): Promise<Coin[]> => {
  const { data: initialData, error } = await supabase
    .from("symbols")
    .select("*")
    .order("last_timestamp", { ascending: false });

  if (error) {
    console.error("Error fetching initial coins:", error);
    return [];
  }
  const data = await getCoinLastInterval();

  if (initialData) {
    const initialCoins = initialData.map((x) => mapSupabaseToCoin(x, data));
    return initialCoins;
  }
  return [];
};
const watchIntervals = (
  setRsiHistoric: Dispatch<SetStateAction<CoinHistoric[]>>,
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
        setRsiHistoric((p) => [historicData, ...p]);
      }
    )
    .subscribe(console.log);

  return channel;
};

export const SupabaseCoinService = {
  getCoins,
  getCoinLastInterval,
  getIntervalsAlert,
  watchIntervals,
  getAllCoinsWithLastIndicatorState,
  getAllCoinsWithIndicatorStates,
};
