import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { firestore } from "../firebase";
import type { Dispatch, SetStateAction } from "react";

export interface Coin {
  closePrice: number;
  emaValue: number;
  highPrice: number;
  id: string;
  lowPrice: number;
  openPrice: number;
  rsiValue: number;
  timestamp: string;
  intervals: string[];
}
export interface CoinHistoric {
  closePrice: number;
  emaValue: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  rsiValue: number;
  timestamp: string;
}

export const CoinService = {
  getCoins: (setCoins: Dispatch<SetStateAction<Coin[]>>) => {
    // const coinSnapshot = await getDocs(q);
    // const coinsList = coinSnapshot.docs.map(
    //   (doc) => ({ id: doc.id, ...doc.data() } as Coin)
    // );
    const marketDataCol = collection(firestore, "marketData");
    const q = query(marketDataCol, orderBy("timestamp", "desc"), limit(12));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      querySnapshot.docs.map((doc) => {
        const data = doc.data();

        const timestamp = new Date(data.timestamp).toLocaleString();
        setCoins((p) => {
          const existingCoin = p.find((coin) => coin.id === doc.id);
          if (existingCoin) {
            return p.map((coin) =>
              coin.id === doc.id ? { ...coin, ...data, timestamp } : coin
            );
          } else {
            return [...p, { id: doc.id, ...data, timestamp } as Coin];
          }
        });
      });
    });
    return unsubscribe;
  },
};
