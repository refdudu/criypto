import { firestore } from "./firebase";
import { SymbolTimeframeIndicatorState } from "./interfaces";
import { config } from "./app"; // Usado para historySaveLimit
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
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

// Tipo para os dados carregados do estado do intervalo
type LoadedIntervalState = {
  emaHistory: number[];
  rsiClosePrices: number[];
  previousAverageGain: number | null;
  previousAverageLoss: number | null;
  closedKlineCountForEMA: number;
} | null;

async function loadSymbolIntervalDataFromFirebase(
  symbol: string,
  interval: string
): Promise<LoadedIntervalState> {
  const docRef = doc(firestore, "marketData", symbol, "intervals", interval);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      console.log(
        `Dados de indicadores para ${symbol}@${interval} carregados do Firestore.`
      );
      const data = docSnap.data();
      return {
        emaHistory: data.emaHistory || [],
        rsiClosePrices: data.rsiClosePrices || [],
        previousAverageGain:
          data.previousAverageGain !== undefined
            ? data.previousAverageGain
            : null,
        previousAverageLoss:
          data.previousAverageLoss !== undefined
            ? data.previousAverageLoss
            : null,
        closedKlineCountForEMA: data.closedKlineCountForEMA || 0,
      };
    } else {
      console.log(
        `Nenhum dado de indicadores encontrado para ${symbol}@${interval} no Firestore. Iniciando vazio.`
      );
      return null;
    }
  } catch (error: any) {
    console.error(
      `Erro ao ler dados de indicadores para ${symbol}@${interval} do Firestore:`,
      error
    );
    return null;
  }
}

async function saveSymbolIntervalDataToFirebase(
  symbol: string,
  interval: string,
  klineDataForHistory: HistoricalKlineData
): Promise<void> {
  console.log("🚀 ~ interval:", interval);
  const intervalStateDoc = doc(firestore, "marketData", symbol);
  const intervalStateDocRef = collection(
    firestore,
    intervalStateDoc.path,
    interval
  );
  //   const intervalStateDoc = await getDoc(intervalStateDocRef);
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
    // if (!intervalStateDoc.exists()) {
    //   // Se o documento não existir, cria um novo com os dados iniciais
    //   await setDoc(intervalStateDocRef, {
    //     emaHistory: [emaValue],
    //     rsiHistory: [rsiValue],
    //     priceHistory: [closePrice],
    //     dateHistory: [new Date().toISOString()],
    //   });
    // } else {
    //   await updateDoc(intervalStateDocRef, {
    //     emaHistory: arrayUnion(emaValue),
    //     rsiHistory: arrayUnion(rsiValue),
    //     priceHistory: arrayUnion(closePrice),
    //     dateHistory: arrayUnion(new Date().toISOString()),
    //   });
    // }
  } catch (error) {
    console.error(
      `Erro ao salvar estado dos indicadores para ${symbol}@${interval} no Firestore:`,
      error
    );
  }

  try {
  } catch (error) {
    console.error(
      `Erro ao salvar kline histórico para ${symbol}@${interval} no Firestore:`,
      error
    );
  }
}

export const CoinRepository = {
  loadSymbolIntervalData: loadSymbolIntervalDataFromFirebase,
  saveSymbolIntervalData: saveSymbolIntervalDataToFirebase,
};
