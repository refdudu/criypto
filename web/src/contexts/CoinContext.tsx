import { createContext, useContext, useEffect, useState } from "react";
import {
  SupabaseCoinService,
  type Coin,
  type CoinHistoric,
} from "../services/supabase/SupabaseCoinService";
// import { DrawerCoinChart } from "../components/CoinChart";

const CoinContext = createContext(
  {} as {
    coins: Coin[];
    rsiHistoric: CoinHistoric[];
  }
);

export const CoinProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [rsiHistoric, setRciHistoric] = useState<CoinHistoric[]>([]);
  //   const [selectedCoin, setSelectedCoin] = useState("");

  useEffect(() => {
    const get = async () => {
      const coins = await SupabaseCoinService.getCoins();
      setCoins(coins);
      const data = await SupabaseCoinService.getIntervalsAlert();
      setRciHistoric(data);
    };
    get();

    const rsiAlertChannel = SupabaseCoinService.watchIntervals(
      setRciHistoric,
      setCoins
    );
    return () => {
      setRciHistoric([]);
      setCoins([]);
      if (rsiAlertChannel) rsiAlertChannel.unsubscribe();
    };
  }, []);

  return (
    <CoinContext.Provider value={{ rsiHistoric, coins }}>
      <div className="bg-gray-900 text-base text-white relative">
        {/* {selectedCoin && selectedCoin !== "" && <DrawerCoinChart />} */}
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
