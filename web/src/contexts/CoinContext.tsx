import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
} from "react";
import {
  SupabaseCoinService,
  type Coin,
  type CoinHistoric,
  type IndicatorState,
} from "../services/supabase/SupabaseCoinService";
import { DrawerCoinChart } from "../components/CoinChart";
// import { DrawerCoinChart } from "../components/CoinChart";

const CoinContext = createContext(
  {} as {
    coins: Coin[];
    rsiHistoric: CoinHistoric[];
    setSelectedCoin: Dispatch<React.SetStateAction<Coin | null>>;
    indicatorStates: IndicatorState[];
  }
);

export const CoinProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [rsiHistoric, setRsiHistoric] = useState<CoinHistoric[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [indicatorStates, setIndicatorStates] = useState<IndicatorState[]>([]);

  useEffect(() => {
    const getHistoric = async () => {
      const historicData = await SupabaseCoinService.getIntervalsAlert();
      setRsiHistoric(historicData);
    };
    const getCoins = async () => {
      const coins = await SupabaseCoinService.getCoins();
      setCoins(coins);
    };
    const getIndicatorStates = async () => {
      const states = await SupabaseCoinService.getIndicatorStates();
      setIndicatorStates(states);
    };

    getIndicatorStates().catch(console.error);
    // getCoins().catch(console.error);
    // getHistoric().catch(console.error);

    const rsiAlertChannel = SupabaseCoinService.watchIntervals(
      setRsiHistoric,
      setCoins
    );

    return () => {
      setRsiHistoric([]);
      setCoins([]);
      if (rsiAlertChannel) rsiAlertChannel.unsubscribe();
    };
  }, []);

  return (
    <CoinContext.Provider
      value={{ rsiHistoric, coins, setSelectedCoin, indicatorStates }}
    >
      <DrawerCoinChart
        selectedCoin={selectedCoin}
        onClose={() => setSelectedCoin(null)}
      />
      <div className="bg-gray-900 text-base text-white relative">
        {children}
      </div>
    </CoinContext.Provider>
  );
};

export const useCoinContext = () => {
  const context = useContext(CoinContext);
  if (!context) {
    throw new Error("useCoinContext must be used within a CoinProvider");
  }
  return context;
};
