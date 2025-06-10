import { createContext, useContext, useEffect, useState } from "react";
import { type Coin, type CoinHistoric } from "../services/CoinService";
import { SupabaseCoinService } from "../services/supabase/SupabaseCoinService";
// import { DrawerCoinChart } from "../components/CoinChart";

const CoinContext = createContext(
  {} as {
    coins: Coin[];
    rciHistoric: CoinHistoric[];
  }
);

export const CoinProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [rciHistoric, setRciHistoric] = useState<CoinHistoric[]>([]);
//   const [selectedCoin, setSelectedCoin] = useState("");

  useEffect(() => {
    const get = async () => {
      const coins = await SupabaseCoinService.getCoins();
      setCoins(coins);
      const data = await SupabaseCoinService.getIntervalsAlert();
      setRciHistoric(data);
    };
    get();

    const rciAlertChannel = SupabaseCoinService.watchIntervals(
      setRciHistoric,
      setCoins
    );
    return () => {
      setRciHistoric([]);
      setCoins([]);
      if (rciAlertChannel) rciAlertChannel.unsubscribe();
    };
  }, []);

  return (
    <CoinContext.Provider value={{ rciHistoric, coins }}>
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
