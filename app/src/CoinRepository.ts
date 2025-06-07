import { firestore } from "./firebase";
import { SymbolTimeframeIndicatorState } from "./interfaces";
import { config } from "./app"; // Usado para historySaveLimit
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";

// Interface para os dados do kline a serem salvos no histórico detalhado
export interface HistoricalKlineData {
  emaValue: number;
  rsiValue: number | null;
  closePrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  timestamp: string;
}

async function loadSymbolIntervalDataFromFirebase(
  symbol: string,
  interval: string
): Promise<HistoricalKlineData[]> {
  const intervalDoc = collection(firestore, "marketData", symbol, interval);
  const q = query(intervalDoc, limit(14), orderBy("timestamp", "desc"));
  const intervals = await getDocs(q);
  return intervals.docs.map((doc) => doc.data() as HistoricalKlineData);
}

async function saveSymbolIntervalDataToFirebase(
  symbol: string,
  interval: string,
  klineDataForHistory: HistoricalKlineData
): Promise<void> {
  const intervalStateDoc = doc(firestore, "marketData", symbol);
  const intervalStateDocRef = collection(
    firestore,
    intervalStateDoc.path,
    interval
  );
  const { closePrice, emaValue, rsiValue } = klineDataForHistory;

  try {
    const _doc = await getDoc(intervalStateDoc);
    const _data = _doc.data();

    let intervals: string[] = [];
    if (_data) {
      intervals = _data.intervals || [];
      if (!intervals.includes(interval)) {
        intervals.push(interval);
      }
    }
    setDoc(intervalStateDoc, {
      closePrice,
      emaValue,
      rsiValue,
      openPrice: klineDataForHistory.openPrice,
      highPrice: klineDataForHistory.highPrice,
      lowPrice: klineDataForHistory.lowPrice,
      timestamp: new Date().toISOString(),
      intervals,
    });
    addDoc(intervalStateDocRef, {
      closePrice,
      emaValue,
      rsiValue,
      openPrice: klineDataForHistory.openPrice,
      highPrice: klineDataForHistory.highPrice,
      lowPrice: klineDataForHistory.lowPrice,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `Erro ao salvar estado dos indicadores para ${symbol}@${interval} no Firestore:`,
      error
    );
  }
}

export const CoinRepository = {
  loadSymbolIntervalData: loadSymbolIntervalDataFromFirebase,
  saveSymbolIntervalData: saveSymbolIntervalDataToFirebase,
};
