import { createContext, useContext, useEffect, useState } from "react";
import { CoinService, type Coin } from "../services/CoinService";
import { Header } from "../components/Header";

const CoinContext = createContext(
  {} as {
    coins: Coin[];
    selectedInterval: string | null;
    setSelectedInterval: (interval: string | null) => void;
  }
);

export const CoinProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState<Coin[]>([]);

  const [selectedInterval, setSelectedInterval] = useState<string | null>(null);
  //   const [coinHistoric, setCoinHistoric] = useState<CoinHistoric[]>([]);

  useEffect(() => {
    setCoins([]);
    CoinService.getCoins(setCoins);
  }, []);

  const intervals = ["1m", "5m", "15m", "1h", "4h"];
  return (
    <CoinContext.Provider
      value={{
        coins,
        selectedInterval,
        setSelectedInterval,
      }}
    >
      <div className="bg-gray-900 text-base text-white">
        <Header
          intervals={intervals}
          selectedInterval={selectedInterval}
          changeSelectedInterval={setSelectedInterval}
        />
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
