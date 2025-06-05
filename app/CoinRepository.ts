import { child, ref, set, get } from "firebase/database";
import { database } from "./firebase";
import { SymbolTimeframeIndicatorState } from "./interfaces";
import { config } from "./app";

// --- Funções de Persistência de Dados (Firebase) ---
async function loadSymbolDataFromFirebase( // RENOMEADO e MODIFICADO
  symbol: string
): Promise<Record<string, { emaHistory: number[]; rsiClosePrices: number[] }>> {
  const dbRef = ref(database);
  try {
    const snapshot = await get(child(dbRef, `marketData/${symbol}`));
    if (snapshot.exists()) {
      console.log(`Dados para ${symbol} carregados do Firebase.`);
      return snapshot.val() as Record<
        string,
        { emaHistory: number[]; rsiClosePrices: number[] }
      >;
    } else {
      console.log(
        `Nenhum dado encontrado para ${symbol} no Firebase. Iniciando vazio.`
      );
      return {};
    }
  } catch (error: any) {
    console.error(`Erro ao ler dados para ${symbol} do Firebase:`, error);
    return {}; // Retorna vazio em caso de erro para não quebrar a inicialização
  }
}

async function saveSymbolDataToFirebase( // RENOMEADO e MODIFICADO
  symbol: string,
  allTimeframesDataForSymbol: Record<string, SymbolTimeframeIndicatorState>
): Promise<void> {
  const dataToPersist: Record<
    string,
    { emaHistory: number[]; rsiClosePrices: number[] }
  > = {};
  for (const interval in allTimeframesDataForSymbol) {
    const tfState = allTimeframesDataForSymbol[interval];
    dataToPersist[interval] = {
      emaHistory: tfState.emaHistory.slice(-config.historySaveLimit),
      rsiClosePrices: tfState.allClosePriceHistoryForRSI.slice(
        -config.historySaveLimit
      ),
    };
  }
  try {
    await set(ref(database, `marketData/${symbol}`), dataToPersist);
    // console.log(`Dados para ${symbol} salvos no Firebase.`); // Log opcional
  } catch (error) {
    console.error(`Erro ao salvar dados para ${symbol} no Firebase:`, error);
  }
}

export const CoinRepository = {loadSymbolDataFromFirebase, saveSymbolDataToFirebase};
