// ./app.ts

import Binance from "node-binance-api";
import { KlineEvent, SymbolTimeframeIndicatorState, SymbolOverallStrategyState } from "./interfaces";
import { readFile, writeFile } from "node:fs/promises";
import "dotenv/config";

// --- Configurações ---
const config = {
  dynamicSymbols: {
    enabled: true,
    topNGainers: 7,
    quoteAsset: "USDT",
    minVolume24h: 10000000, // 10 Milhões em volume de USDT
    fallbackSymbols: ["BTCUSDT", "ETHUSDT", "LPTUSDT"]
  },
  intervals: ["1m", "5m", "15m", "1h", "4h"],
  
  strategy: {
    rallyDetectionTimeframes: ["15m", "1h", "4h"],
    entryTimeframe: "5m",
    rallyLookbackPeriods: 48, 
    rallyMinPercentIncrease: 20, 
    rallyPrimedInvalidationDropPercent: 10,
    rsiOversoldThreshold: 30,
  },
  
  emaPeriod: 21,
  rsiPeriod: 14,
  historySaveLimit: 300,
};

const indicatorStates: Record<string, Record<string, SymbolTimeframeIndicatorState>> = {};
const symbolStrategyStates: Record<string, SymbolOverallStrategyState> = {};

// --- Funções de Persistência de Dados (Um arquivo por símbolo) ---
async function loadSymbolDataFromFile(symbol: string): Promise<Record<string, { emaHistory: number[], rsiClosePrices: number[] }>> {
  const fileName = `./${symbol}_marketData.json`;
  try {
    const data = await readFile(fileName, "utf-8");
    return JSON.parse(data) as Record<string, { emaHistory: number[], rsiClosePrices: number[] }>;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(`Arquivo de dados para ${symbol} (${fileName}) não encontrado. Iniciando vazio.`);
    } else {
      console.error(`Erro ao ler dados para ${symbol} (${fileName}):`, error);
    }
    return {};
  }
}

async function saveSymbolDataToFile(symbol: string, allTimeframesDataForSymbol: Record<string, SymbolTimeframeIndicatorState>): Promise<void> {
  const fileName = `./${symbol}_marketData.json`;
  const dataToPersist: Record<string, { emaHistory: number[], rsiClosePrices: number[] }> = {};
  for (const interval in allTimeframesDataForSymbol) {
    const tfState = allTimeframesDataForSymbol[interval];
    dataToPersist[interval] = {
      emaHistory: tfState.emaHistory.slice(-config.historySaveLimit),
      rsiClosePrices: tfState.allClosePriceHistoryForRSI.slice(-config.historySaveLimit),
    };
  }
  try {
    await writeFile(fileName, JSON.stringify(dataToPersist, null, 2));
  } catch (error) {
    console.error(`Erro ao salvar dados para ${symbol} (${fileName}):`, error);
  }
}

// --- Função para Buscar Top Gainers ---
async function getTopGainersFromBinance(
    binance: Binance, topN: number, quoteAsset: string, minVolume: number
): Promise<string[]> {
  console.log(`Buscando top ${topN} gainers (24h), quote: ${quoteAsset}, vol > ${minVolume}...`);
  try {
    const tickers: any[] = await binance.prevDay(false);
    if (!Array.isArray(tickers)) {
        console.error("Erro: prevDay não retornou array. Dados:", tickers);
        return config.dynamicSymbols.fallbackSymbols;
    }
    const filteredAndSorted = tickers
      .filter(t => 
        typeof t.symbol === 'string' && t.symbol.endsWith(quoteAsset) &&
        t.quoteVolume && parseFloat(t.quoteVolume) > minVolume &&
        typeof t.priceChangePercent !== 'undefined' 
      )
      .map(t => ({ symbol: t.symbol, priceChangePercent: parseFloat(t.priceChangePercent) }))
      .sort((a, b) => b.priceChangePercent - a.priceChangePercent);

    const topGainers = filteredAndSorted.slice(0, topN).map(t => t.symbol);
    if (topGainers.length === 0) {
        console.warn(`Nenhum gainer encontrado. Usando fallback: ${config.dynamicSymbols.fallbackSymbols.join(', ')}`);
        return config.dynamicSymbols.fallbackSymbols;
    }
    console.log(`Top ${topN} gainers (24h) selecionados:`, topGainers);
    return topGainers;
  } catch (error) {
    console.error("Erro ao buscar top gainers:", error);
    return config.dynamicSymbols.fallbackSymbols;
  }
}

// --- Lógica Principal ---
const main = async () => {
  const binance = new Binance({
    APIKEY: process.env.BINANCE_API_KEY, APISECRET: process.env.BINANCE_API_SECRET,
  });

  let symbolsToMonitor: string[];
  if (config.dynamicSymbols.enabled) {
    symbolsToMonitor = await getTopGainersFromBinance(
        binance, config.dynamicSymbols.topNGainers,
        config.dynamicSymbols.quoteAsset, config.dynamicSymbols.minVolume24h
    );
  } else {
    symbolsToMonitor = config.dynamicSymbols.fallbackSymbols;
    console.log("Monitoramento dinâmico desabilitado. Usando fallback:", symbolsToMonitor);
  }
  
  if (!symbolsToMonitor || symbolsToMonitor.length === 0) {
    console.error("ERRO: Nenhum símbolo para monitorar. Encerrando."); return;
  }
  console.log("SÍMBOLOS MONITORADOS NESTA SESSÃO:", symbolsToMonitor.join(', '));

  for (const symbol of symbolsToMonitor) {
    const loadedSymbolData = await loadSymbolDataFromFile(symbol);
    indicatorStates[symbol] = {};
    for (const interval of config.intervals) {
      const intervalData = loadedSymbolData[interval] || { emaHistory: [], rsiClosePrices: [] };
      indicatorStates[symbol][interval] = {
        allClosePriceHistoryForRSI: intervalData.rsiClosePrices || [],
        emaHistory: intervalData.emaHistory || [],
        previousAverageGain: null, previousAverageLoss: null, rsiValue: null,
        closedKlineCountForEMA: (intervalData.emaHistory || []).length,
      };
    }
    symbolStrategyStates[symbol] = {
      isPrimedFor5mEntry: false, rallyReferencePrice: null,
      rallyPeakPriceSincePrimed: null, rallyDetectedOnTimeframe: null,
    };
    console.log(`[Setup] Estados para ${symbol} inicializados.`);
  }

  const streams: string[] = [];
  symbolsToMonitor.forEach(symbol => {
    config.intervals.forEach(interval => {
      streams.push(`${symbol.toLowerCase()}@kline_${interval}`);
    });
  });

  if (streams.length === 0) { console.error("Nenhum stream para inscrever. Encerrando."); return; }
  console.log(`Iniciando monitoramento para ${streams.length} streams (ex: ${streams.slice(0,3).join(", ")}...).`);

  // @ts-ignore TS2345
  binance.websockets.subscribeCombined(streams, (klineEventData: KlineEvent) => {
    if (symbolsToMonitor.includes(klineEventData.s)) {
        handleKlineDataWithIndicators(klineEventData).catch(e => console.error(`Erro em handleKlineData [${klineEventData.s}@${klineEventData.k.i}]: ${e}`, e.stack));
    }
  });
};

const handleKlineDataWithIndicators = async (klinePayload: KlineEvent): Promise<void> => {
  if (!klinePayload || !klinePayload.k) {
    console.warn("Payload da vela inválido:", JSON.stringify(klinePayload, null, 2)); return;
  }
  const eventSymbol = klinePayload.s;
  const interval = klinePayload.k.i;
  const kline = klinePayload.k;
  const eventTime = new Date(klinePayload.E).toLocaleTimeString("pt-BR");
  const closePrice = parseFloat(kline.c);

  const tfState = indicatorStates[eventSymbol]?.[interval];
  const stratState = symbolStrategyStates[eventSymbol];

  if (!tfState || !stratState) {
    console.warn(`Estado tfState ou stratState não inicializado para ${eventSymbol}@${interval}.`); return;
  }
  if (!kline.x) return; 

  console.log(`\n--- [${eventSymbol} @ ${interval} | ${eventTime}] Fech: ${closePrice.toFixed(2)} ---`);

  // --- CÁLCULO DE EMA ---
  const emaMultiplier = 2 / (config.emaPeriod + 1);
  tfState.closedKlineCountForEMA++;
  let currentEMA: number;
  if (tfState.closedKlineCountForEMA === 1 || tfState.emaHistory.length === 0) {
    currentEMA = closePrice;
  } else {
    const previousEMA = tfState.emaHistory[tfState.emaHistory.length - 1];
    currentEMA = closePrice * emaMultiplier + previousEMA * (1 - emaMultiplier);
  }
  tfState.emaHistory.push(currentEMA);
  if (tfState.emaHistory.length > config.historySaveLimit) tfState.emaHistory.shift();
  // Log da EMA será feito junto com o RSI ou após a verificação de dados suficientes para RSI

  // --- CÁLCULO DE RSI ---
  tfState.allClosePriceHistoryForRSI.push(closePrice);
  if (tfState.allClosePriceHistoryForRSI.length > config.historySaveLimit) tfState.allClosePriceHistoryForRSI.shift();
  
  if (tfState.allClosePriceHistoryForRSI.length <= config.rsiPeriod) {
    console.log(`[${eventSymbol}@${interval}] MME(${config.emaPeriod}): ${currentEMA.toFixed(4)}`);
    console.log(`[${eventSymbol}@${interval}] RSI: Aguardando ${config.rsiPeriod + 1}p. (${tfState.allClosePriceHistoryForRSI.length})`);
  } else {
    const relevantPrices = tfState.allClosePriceHistoryForRSI.slice(-(config.rsiPeriod + 1));
    const priceChanges: number[] = [];
    for (let i = 1; i < relevantPrices.length; i++) {
      priceChanges.push(relevantPrices[i] - relevantPrices[i - 1]);
    }
    const gains = priceChanges.map(c => (c > 0 ? c : 0));
    const losses = priceChanges.map(c => (c < 0 ? Math.abs(c) : 0));
    let avgGain: number, avgLoss: number;

    if (tfState.previousAverageGain === null || tfState.previousAverageLoss === null || 
        (relevantPrices.length === (config.rsiPeriod + 1) && priceChanges.length === config.rsiPeriod) // Garante SMA no primeiro cálculo completo
       ) {
        avgGain = gains.reduce((s, v) => s + v, 0) / config.rsiPeriod;
        avgLoss = losses.reduce((s, v) => s + v, 0) / config.rsiPeriod;
    } else {
        avgGain = (tfState.previousAverageGain * (config.rsiPeriod - 1) + gains[gains.length - 1]) / config.rsiPeriod;
        avgLoss = (tfState.previousAverageLoss * (config.rsiPeriod - 1) + losses[losses.length - 1]) / config.rsiPeriod;
    }
    tfState.previousAverageGain = avgGain; 
    tfState.previousAverageLoss = avgLoss;

    if (avgLoss === 0) tfState.rsiValue = 100;
    else { 
      const rs = avgGain / avgLoss; 
      tfState.rsiValue = 100 - 100 / (1 + rs); 
    }
    console.log(`[${eventSymbol}@${interval}] MME(${config.emaPeriod}): ${currentEMA.toFixed(4)}`);
    console.log(`[${eventSymbol}@${interval}] RSI(${config.rsiPeriod}): ${tfState.rsiValue.toFixed(2)}`);
  }
  
  // Salva os históricos de EMA e RSI (preços) após cada atualização
  await saveSymbolDataToFile(eventSymbol, indicatorStates[eventSymbol]);

  // --- LÓGICA DA ESTRATÉGIA ---
  // Parte 1: DETECÇÃO/GERENCIAMENTO DA "GRANDE VALORIZAÇÃO" (Macro Rally)
  if (config.strategy.rallyDetectionTimeframes.includes(interval)) {
    if (!stratState.isPrimedFor5mEntry) {
      if (tfState.allClosePriceHistoryForRSI.length >= config.strategy.rallyLookbackPeriods) {
        const lookbackPrices = tfState.allClosePriceHistoryForRSI.slice(-config.strategy.rallyLookbackPeriods);
        const lowWatermark = Math.min(...lookbackPrices);
        if (closePrice > lowWatermark * (1 + config.strategy.rallyMinPercentIncrease / 100)) {
          stratState.isPrimedFor5mEntry = true;
          stratState.rallyReferencePrice = lowWatermark;
          stratState.rallyPeakPriceSincePrimed = closePrice;
          stratState.rallyDetectedOnTimeframe = interval;
          console.log(`\x1b[36m\x1b[1m[${eventSymbol}] SÍMBOLO ARMADO! Valorização de ${( (closePrice - lowWatermark) / lowWatermark * 100).toFixed(2)}% detectada em ${interval} (fundo ref.: ${lowWatermark.toFixed(2)}). Aguardando RSI de ${config.strategy.entryTimeframe}.\x1b[0m`);
        }
      }
    } else { // Símbolo já está "armado" (isPrimedFor5mEntry === true)
      // Atualiza o pico se o preço no timeframe de detecção atual for maior
      if (closePrice > (stratState.rallyPeakPriceSincePrimed || 0) ) {
         stratState.rallyPeakPriceSincePrimed = closePrice;
         // console.log(`\x1b[36m[${eventSymbol}] Pico da valorização (armado) atualizado para ${closePrice.toFixed(2)} via ${interval}.\x1b[0m`);
      }
      // Verifica invalidação do estado "armado"
      if (stratState.rallyPeakPriceSincePrimed && closePrice < stratState.rallyPeakPriceSincePrimed * (1 - config.strategy.rallyPrimedInvalidationDropPercent / 100)) {
        console.log(`\x1b[31m[${eventSymbol}] SÍMBOLO DESARMADO. Preço (${closePrice.toFixed(2)} @ ${interval}) caiu de ${stratState.rallyPeakPriceSincePrimed.toFixed(2)} (pico desde armado).\x1b[0m`);
        stratState.isPrimedFor5mEntry = false;
        stratState.rallyReferencePrice = null;
        stratState.rallyPeakPriceSincePrimed = null;
        stratState.rallyDetectedOnTimeframe = null;
      }
    }
  }

  // Parte 2: GATILHO DE ENTRADA (ocorre APENAS no 'entryTimeframe')
  if (interval === config.strategy.entryTimeframe) {
    if (stratState.isPrimedFor5mEntry && 
        tfState.rsiValue !== null && 
        tfState.rsiValue < config.strategy.rsiOversoldThreshold) {
      console.warn(`\x1b[33m\x1b[1m>>> GATILHO DE ENTRADA [${eventSymbol}@${interval}]: RSI (${tfState.rsiValue.toFixed(2)}) em sobrevenda APÓS VALORIZAÇÃO (detectada em ${stratState.rallyDetectedOnTimeframe}, pico armado ${stratState.rallyPeakPriceSincePrimed?.toFixed(2)}). COMPRAR!\x1b[0m`);
      
      // Reseta o estado "armado" para garantir "primeira vez" após ESTA valorização
      stratState.isPrimedFor5mEntry = false; 
      stratState.rallyReferencePrice = null;
      stratState.rallyPeakPriceSincePrimed = null;
      stratState.rallyDetectedOnTimeframe = null;
      
      // TODO: Implementar lógica de execução de ordem de compra aqui
      // Ex: try {
      //   const quantityToBuy = 0.01; // Defina a quantidade
      //   console.log(`Tentando comprar ${quantityToBuy} de ${eventSymbol}...`);
      //   const orderResult = await binance.marketBuy(eventSymbol, quantityToBuy);
      //   console.log(`Ordem de COMPRA para ${eventSymbol} executada:`, orderResult);
      // } catch (e) {
      //   console.error(`ERRO AO EXECUTAR ORDEM DE COMPRA para ${eventSymbol}:`, e);
      // }
    }
  }
}; // Fim de handleKlineDataWithIndicators

main().catch((error) => {
  console.error("Erro fatal na aplicação:", error);
  process.exit(1);
});