import { createContext, type Dispatch, type SetStateAction } from "react";
import type { Coin, CoinHistoric, IndicatorState } from "../services/supabase/SupabaseCoinService";
export interface CoinValue {
  coins:Coin[];rsiHistoric:CoinHistoric[];setSelectedCoin:Dispatch<SetStateAction<Coin|null>>;
  indicatorStates:IndicatorState[];error:string|null;loading:boolean;refresh:()=>void;revision:number;
}
export const CoinContext=createContext<CoinValue|null>(null);
