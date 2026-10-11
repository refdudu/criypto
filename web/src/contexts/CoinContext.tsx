import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { SupabaseCoinService, type Coin, type CoinHistoric, type IndicatorState } from "../services/supabase/SupabaseCoinService";
import { DrawerCoinChart } from "../components/CoinChart";

interface Value {
  coins: Coin[]; rsiHistoric: CoinHistoric[];
  setSelectedCoin: Dispatch<SetStateAction<Coin | null>>;
  indicatorStates: IndicatorState[]; error: string | null; loading: boolean;
  refresh: () => void;
}
const CoinContext = createContext<Value | null>(null);
export function CoinProvider({ children }: { children: React.ReactNode }) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [rsiHistoric, setRsiHistoric] = useState<CoinHistoric[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [indicatorStates, setIndicatorStates] = useState<IndicatorState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = () => {
    void Promise.all([
      SupabaseCoinService.getCoins(), SupabaseCoinService.getIntervalsAlert(),
      SupabaseCoinService.getIndicatorStates()
    ]).then(([nextCoins, alerts, states]) => {
      setCoins(nextCoins); setRsiHistoric(alerts); setIndicatorStates(states); setError(null);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
    const channel = SupabaseCoinService.watch(refresh);
    // Polling fallback also covers deployments without Supabase Realtime publication.
    const timer = setInterval(refresh, 60_000);
    return () => { clearInterval(timer); void channel.unsubscribe(); };
  }, []);
  return (
    <CoinContext.Provider value={{ coins, rsiHistoric, setSelectedCoin, indicatorStates, error, loading, refresh }}>
      <DrawerCoinChart selectedCoin={selectedCoin} onClose={() => setSelectedCoin(null)} />
      <div className="bg-gray-900 min-h-screen text-base text-white relative">{children}</div>
    </CoinContext.Provider>
  );
}
export function useCoinContext() {
  const value = useContext(CoinContext);
  if (!value) throw new Error("useCoinContext must be used within CoinProvider");
  return value;
}
