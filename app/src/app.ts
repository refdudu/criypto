// ./app.ts

import Binance from "node-binance-api";
import { KlineEvent, SymbolTimeframeIndicatorState } from "./interfaces";
import "dotenv/config";
import { SupabaseCoinRepository } from "./supabase/SupabaseCoinRepository";
import { HistoricalKlineData } from "./CoinRepository";
// import { SupabaseCoinRepository, HistoricalKlineData } from "./SupabaseCoinRepository";

// --- Configurações Simplificadas ---
export const config = {
  // Mantive a busca dinâmica de símbolos, você pode desabilitar se quiser
  dynamicSymbols: {
    enabled: true,
    topNGainers: 100,
    quoteAsset: "USDT",
    minVolume24h: 10000000, // 10 Milhões em volume de USDT
    fallbackSymbols: ["BTCUSDT", "ETHUSDT"], // Símbolos para monitorar se a busca dinâmica estiver desabilitada
  },
  intervals: ["5m", "15m", "30m", "1h", "4h"],
  emaPeriod: 21,
  rsiPeriod: 14,
  historyFetchLimit: 100, // Limite de dados históricos para buscar do Firebase
};

// --- Estado em Memória para os Indicadores ---
// Mantém os valores necessários para o cálculo contínuo (suavizado) do RSI
const indicatorStates: Record<
  string,
  Record<string, SymbolTimeframeIndicatorState>
> = {};

// --- Função para Buscar Top Gainers (Mantida) ---
interface BinanceDailyStat {
  symbol: string;
  priceChangePercent: string;
  quoteVolume: string;
}

async function getTopGainersFromBinance(
  binance: Binance,
  topN: number,
  quoteAsset: string,
  minVolume: number
): Promise<string[]> {
  console.log(
    `Buscando top ${topN} gainers (24h), quote: ${quoteAsset}, vol > ${minVolume}...`
  );
  try {
    const tickersResponse = await binance.prevDay(); // false para todos os símbolos

    const tickersArray: BinanceDailyStat[] = Array.isArray(tickersResponse)
      ? tickersResponse
      : [];

    const filteredAndSorted = tickersArray
      .filter(
        (ticker) =>
          ticker.symbol.endsWith(quoteAsset) &&
          parseFloat(ticker.quoteVolume) > minVolume
      )
      .map((ticker) => ({
        symbol: ticker.symbol,
        priceChangePercent: parseFloat(ticker.priceChangePercent),
      }))
      .sort((a, b) => b.priceChangePercent - a.priceChangePercent);

    const topGainers = filteredAndSorted.slice(0, topN).map((t) => t.symbol);

    if (topGainers.length === 0) {
      console.warn(
        `Nenhum gainer encontrado com os critérios. Usando fallback: ${config.dynamicSymbols.fallbackSymbols.join(
          ", "
        )}`
      );
      return config.dynamicSymbols.fallbackSymbols;
    }
    console.log(`Top ${topN} gainers selecionados:`, topGainers.join(", "));

    // return [...topGainers, "BTCUSDT", "ETHUSDT"];
    return topGainers;
  } catch (error) {
    console.error("Erro ao buscar top gainers:", error);
    return config.dynamicSymbols.fallbackSymbols;
  }
}

// --- Lógica Principal ---
const main = async () => {
  const binance = new Binance({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET,
  });

  const symbolsToMonitor = config.dynamicSymbols.enabled
    ? await getTopGainersFromBinance(
        binance,
        config.dynamicSymbols.topNGainers,
        config.dynamicSymbols.quoteAsset,
        config.dynamicSymbols.minVolume24h
      )
    : config.dynamicSymbols.fallbackSymbols;

  if (!symbolsToMonitor || symbolsToMonitor.length === 0) {
    console.error("ERRO CRÍTICO: Nenhum símbolo para monitorar. Encerrando.");
    return;
  }

  console.log(
    "SÍMBOLOS MONITORADOS NESTA SESSÃO:",
    symbolsToMonitor.join(", ")
  );

  // Inicializa o estado em memória para cada símbolo e intervalo
  for (const symbol of symbolsToMonitor) {
    indicatorStates[symbol] = {};
    for (const interval of config.intervals) {
      indicatorStates[symbol][interval] = {
        // Históricos não são mais necessários aqui, pois buscamos do repo
        allClosePriceHistoryForRSI: [],
        emaHistory: [],
        // Essencial para o cálculo suavizado do RSI
        previousAverageGain: null,
        previousAverageLoss: null,
        rsiValue: null,
        closedKlineCountForEMA: 0, // Pode ser útil se o EMA precisar ser reiniciado
      };
    }
    console.log(`[Setup] Estado em memória para ${symbol} inicializado.`);
  }

  const streams = symbolsToMonitor.flatMap((symbol) =>
    config.intervals.map(
      (interval) => `${symbol.toLowerCase()}@kline_${interval}`
    )
  );

  console.log(`Iniciando monitoramento para ${streams.length} streams...`);
  streams.forEach((stream) => {
    binance.websockets.subscribe(stream, (klineEventData: KlineEvent) => {
      // Garante que o evento é para um símbolo que estamos monitorando
      if (symbolsToMonitor.includes(klineEventData.s)) {
        handleKlineData(klineEventData).catch((e) =>
          console.error(
            `Erro em handleKlineData [${klineEventData.s}@${klineEventData.k.i}]:`,
            e
          )
        );
      }
    });
  });
};

/**
 * Manipula cada evento de kline, calcula os indicadores e salva no banco de dados.
 */
const handleKlineData = async (klinePayload: KlineEvent): Promise<void> => {
  const { s: eventSymbol, k: kline, E: eventTime } = klinePayload;

  // Processa apenas quando a vela (kline) fecha
  if (!kline.x) {
    return;
  }

  const interval = kline.i;
  const closePrice = parseFloat(kline.c);
  const tfState = indicatorStates[eventSymbol]?.[interval];

  if (!tfState) {
    console.warn(
      `Estado não encontrado para ${eventSymbol}@${interval}. Pulando.`
    );
    return;
  }

  console.log(
    `\n--- [${eventSymbol} @ ${interval} | ${new Date(
      eventTime
    ).toLocaleTimeString("pt-BR")}] Fech: ${closePrice.toFixed(4)} ---`
  );

  // --- CÁLCULO DE EMA ---
  const emaMultiplier = 2 / (config.emaPeriod + 1);
  const lastEMA =
    tfState.emaHistory.length > 0
      ? tfState.emaHistory[tfState.emaHistory.length - 1]
      : closePrice; // Usa o primeiro preço de fechamento se não houver histórico de EMA
  const currentEMA = closePrice * emaMultiplier + lastEMA * (1 - emaMultiplier);
  tfState.emaHistory.push(currentEMA);
  if (tfState.emaHistory.length > config.historyFetchLimit) {
    tfState.emaHistory.shift();
  }

  // --- CÁLCULO DE RSI ---
  // 1. Busca os preços de fechamento históricos para o cálculo inicial
  const historicalData = await SupabaseCoinRepository.loadSymbolIntervalData(
    eventSymbol,
    interval
  );
  // O repositório retorna em ordem decrescente de tempo, então revertemos para ter do mais antigo ao mais novo
  const closePrices = historicalData.map((d) => d.closePrice).reverse();
  closePrices.push(closePrice); // Adiciona o preço de fechamento atual

  // 2. Calcula o RSI se tivermos dados suficientes
  if (closePrices.length > config.rsiPeriod) {
    const priceChanges: number[] = [];
    for (let i = 1; i < closePrices.length; i++) {
      const change = closePrices[i] - closePrices[i - 1];
      priceChanges.push(change);
    }

    const gains = priceChanges.map((change) => (change > 0 ? change : 0));
    const losses = priceChanges.map((change) =>
      change < 0 ? Math.abs(change) : 0
    );

    let avgGain: number;
    let avgLoss: number;

    // Se não tivermos médias anteriores, calculamos a média simples (primeiro cálculo)
    if (
      tfState.previousAverageGain === null ||
      tfState.previousAverageLoss === null
    ) {
      const initialGains = gains.slice(-config.rsiPeriod); // Pega os últimos N ganhos
      const initialLosses = losses.slice(-config.rsiPeriod); // Pega as últimas N perdas
      avgGain =
        initialGains.reduce((acc, val) => acc + val, 0) / config.rsiPeriod;
      avgLoss =
        initialLosses.reduce((acc, val) => acc + val, 0) / config.rsiPeriod;
    } else {
      // Se já tivermos, usamos o cálculo suavizado (Wilder's RSI)
      const lastGain = gains[gains.length - 1];
      const lastLoss = losses[losses.length - 1];
      avgGain =
        (tfState.previousAverageGain * (config.rsiPeriod - 1) + lastGain) /
        config.rsiPeriod;
      avgLoss =
        (tfState.previousAverageLoss * (config.rsiPeriod - 1) + lastLoss) /
        config.rsiPeriod;
    }

    // Armazena as novas médias para o próximo cálculo
    tfState.previousAverageGain = avgGain;
    tfState.previousAverageLoss = avgLoss;

    // Calcula o valor final do RSI
    if (avgLoss === 0) {
      tfState.rsiValue = 100;
    } else {
      const rs = avgGain / avgLoss;
      tfState.rsiValue = 100 - 100 / (1 + rs);
    }
  }

  // Log dos indicadores calculados
  console.log(
    `[${eventSymbol}@${interval}] EMA(${
      config.emaPeriod
    }): ${currentEMA.toFixed(4)}`
  );
  if (tfState.rsiValue !== null) {
    console.log(
      `[${eventSymbol}@${interval}] RSI(${
        config.rsiPeriod
      }): ${tfState.rsiValue.toFixed(2)}`
    );
  } else {
    console.log(
      `[${eventSymbol}@${interval}] RSI: Aguardando mais dados (${
        closePrices.length
      }/${config.rsiPeriod + 1} velas)`
    );
  }

  // --- SALVAR NO FIREBASE ---
  const klineDataForHistory: HistoricalKlineData = {
    closePrice: closePrice,
    openPrice: parseFloat(kline.o),
    highPrice: parseFloat(kline.h),
    lowPrice: parseFloat(kline.l),
    timestamp: new Date(kline.t).toISOString(),
    emaValue: currentEMA,
    rsiValue: tfState.rsiValue,
  };

  await SupabaseCoinRepository.saveSymbolIntervalData(
    eventSymbol,
    interval,
    klineDataForHistory
  );
};

main().catch((error) => {
  console.error("Erro fatal na aplicação:", error);
  process.exit(1);
});
