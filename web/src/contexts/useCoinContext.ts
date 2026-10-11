import { useContext } from "react";
import { CoinContext } from "./CoinState";
export function useCoinContext(){
  const value=useContext(CoinContext);
  if(!value)throw new Error("useCoinContext must be used within CoinProvider");
  return value;
}
