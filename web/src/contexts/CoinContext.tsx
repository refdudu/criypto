import { createContext, useContext, useEffect, useState } from "react";
import { CoinService, type Coin } from "../services/CoinService";

const CoinContext = createContext(
  {} as {
    coins: Coin[];
  }
);

export const CoinProvider = ({ children }: { children: React.ReactNode }) => {
  const [coins, setCoins] = useState<Coin[]>([]);
  useEffect(() => {
    setCoins([]);
    CoinService.getCoins(setCoins);
  }, []);

  return (
    <CoinContext.Provider
      value={{
        coins,
      }}
    >
      <div className="bg-gray-900 text-base text-white">{children}</div>
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
