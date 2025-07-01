import Binance from "node-binance-api";
import express from "express";
import {
  BinanceDailyStat,
  BinancePrevDayResponse,
  HistoricalKlineData,
  KlineEvent,
  SymbolTimeframeIndicatorState,
} from "./interfaces";
import "dotenv/config";
import {
  DataSymbolsState,
  SupabaseCoinRepository,
} from "./supabase/SupabaseCoinRepository";
import { lucaWebhook } from "./lucaWebhook";
import { CoinMap } from "./coinMap";

export const config = {
  dynamicSymbols: {
    enabled: true,
    topNGainers: 100,
    quoteAsset: "USDT",
    minVolume24h: 5000000, // 5 Milhões em volume de USDT
    fallbackSymbols: ["BTCUSDT", "ETHUSDT"], // Símbolos para monitorar se a busca dinâmica estiver desabilitada
  },
  intervals: ["5m", "15m", "1h", "4h"],
  emaPeriod: 21,
  rsiPeriod: 14,
  historyFetchLimit: 200,
};

// --- Estado em Memória para os Indicadores ---
// Mantém os valores necessários para o cálculo contínuo (suavizado) do RSI
let indicatorStates: DataSymbolsState = {};

// --- Função para Buscar Top Gainers (Mantida) ---

async function getTopGainersFromBinance(
  binance: Binance,
  //   topN: number,
  quoteAsset: string,
  minVolume: number
): Promise<string[]> {
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

    const topGainers = filteredAndSorted.map((t) => t.symbol);
    //

    if (topGainers.length === 0) {
      console.warn(
        `Nenhum gainer encontrado com os critérios. Usando fallback: ${config.dynamicSymbols.fallbackSymbols.join(
          ", "
        )}`
      );
      return config.dynamicSymbols.fallbackSymbols;
    }

    return topGainers;
  } catch (error) {
    console.error("Erro ao buscar top gainers:", error);
    return config.dynamicSymbols.fallbackSymbols;
  }
}

const server = () => {
  const app = express();
  app.use(express.json());

//   app.get("/:symbol", async (req, res) => {
//     const { symbol } = req.params;
//     // await lucaWebhook({
//     //   id: symbol,
//     //   rsi: 28,
//     //   ema: 200,
//     //   date: new Date(),
//     //   interval: "1h",
//     // });
//     res.status(200).send(indicatorStates);
//   });
  app.get("/", async (req, res) => {
    // const data = Object.entries(indicatorStates)
    //   .map(([symbol, intervals]) => ({
    //     symbol,
    //     intervals: Object.keys(intervals),
    //   }))
    //   .flatMap(({ intervals, symbol }) =>
    //     intervals.map((interval) => ({
    //       symbol,
    //       interval,
    //     }))
    //   );
    // const promises = data.map((x) =>
    //   SupabaseCoinRepository.checkRecentRsiAlerts(x.symbol, x.interval).catch(
    //     console.error
    //   )
    // );
    // const _data = [];
    // for (const promise of promises) { 
    //     _data.push(await promise);
    // }
    res.status(200).send('ok');
  });

  const port = process.env.API_PORT || 3000;
  const listener = app.listen(port, () => console.log(listener.address()));
};

const binanceStart = async () => {
  const binance = new Binance({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET,
    reconnect: true,
  });

  const symbolsToMonitor = await getTopGainersFromBinance(
    binance,
    config.dynamicSymbols.quoteAsset,
    config.dynamicSymbols.minVolume24h
  );

  if (!symbolsToMonitor || symbolsToMonitor.length === 0) {
    console.error("ERRO CRÍTICO: Nenhum símbolo para monitorar. Encerrando.");
    return;
  }

  indicatorStates = await SupabaseCoinRepository.loadInitialStateForAllSymbols(
    symbolsToMonitor,
    config.intervals,
    config.historyFetchLimit
  );
  //   return;

  const streams = symbolsToMonitor.flatMap((symbol) =>
    config.intervals.map(
      (interval) => `${symbol.toLowerCase()}@kline_${interval}`
    )
  );

  streams.forEach(async (stream, index) => {
    const callback = (klineEventData: KlineEvent) => {
      if (symbolsToMonitor.includes(klineEventData.s)) {
        handleKlineData(klineEventData).catch((e) =>
          console.error(
            `Erro em handleKlineData [${klineEventData.s}@${klineEventData.k.i}]:`,
            e
          )
        );
      }
    };
    await new Promise((resolve) =>
      setTimeout(() => resolve(true), 100 * index)
    );
    console.log(`${stream} iniciado.`);
    const listen = (tries: number) => {
      if (tries > 10) {
        console.error(`Falha ao conectar ao WebSocket após várias tentativas.`);
        return;
      }
      binance.websockets.subscribe(
        stream,
        callback,
        () => listen(tries + 1),
        () => true
      );
    };
    listen(0);
  });

  //   binance.websockets.prevDay(
  //     symbolsToMonitor,
  //     async (_error: any, data: BinancePrevDayResponse) => {
  //       //   if (parseFloat(data.quoteVolume) < 10000000) return;
  //       const percent = parseFloat(data.percentChange);
  //       if (percent < 20) return;
  //       // cria registro de variação maior de 20% para caso um RSI menor que 30 nos intervalos de 5m, 15m e 1h aparecer
  //       // se ja tiver registro da moeda deve ignorar

  //       try {
  //         const isObservable = await SupabaseCoinRepository.getSymbolObserve(
  //           data.symbol
  //         );
  //         if (isObservable) return;
  //         await SupabaseCoinRepository.createSymbolObserve(data.symbol);
  //         console.log(data.percentChange, data.symbol);
  //       } catch (e) {
  //         console.log(e);
  //       }
  //     }
  //   );
};

const main = async () => {
  server();
  binanceStart();
};

const handleKlineData = async (klinePayload: KlineEvent): Promise<void> => {
  const { s: eventSymbol, k: kline, E: eventTime } = klinePayload;
  if (!kline.x) return;

  const interval = kline.i;
  const closePrice = parseFloat(kline.c);

  if (!indicatorStates[eventSymbol]?.[interval]) {
    console.warn(
      `Estado não encontrado para ${eventSymbol}@${interval}. Criando.`
    );
    indicatorStates[eventSymbol] = {
      [interval]: {
        emaHistory: [],
        closePrices: [],
        rsiValue: null,
        previousAverageGain: null,
        previousAverageLoss: null,
      },
    };
  }

  const tfState = indicatorStates[eventSymbol]?.[interval];

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

  tfState.closePrices.push(closePrice);

  if (tfState.closePrices.length > config.rsiPeriod) {
    const priceChanges: number[] = [];
    for (let i = 1; i < tfState.closePrices.length; i++) {
      const change = tfState.closePrices[i] - tfState.closePrices[i - 1];
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

    tfState.previousAverageGain = avgGain;
    tfState.previousAverageLoss = avgLoss;

    if (avgLoss === 0) {
      tfState.rsiValue = 100;
    } else {
      const rs = avgGain / avgLoss;
      tfState.rsiValue = 100 - 100 / (1 + rs);
    }
  }

  console.log(
    `[${eventSymbol}@${interval}] EMA(${
      config.emaPeriod
    }): ${currentEMA.toFixed(4)}`
  );

  const klineDataForHistory: HistoricalKlineData = {
    closePrice: closePrice,
    openPrice: parseFloat(kline.o),
    highPrice: parseFloat(kline.h),
    lowPrice: parseFloat(kline.l),
    timestamp: new Date(kline.t).toISOString(),
    emaValue: currentEMA,
    rsiValue: tfState.rsiValue,
  };

  try {
    await SupabaseCoinRepository.saveSymbolIntervalData(
      eventSymbol,
      interval,
      klineDataForHistory
    );
    sendWebhook(eventSymbol, tfState, currentEMA, eventTime, interval).catch(
      (e) =>
        console.error(
          `Erro ao enviar webhook para ${eventSymbol}@${interval}:`,
          e
        )
    );
  } catch {}
};

const sendWebhook = async (
  eventSymbol: string,
  tfState: SymbolTimeframeIndicatorState,
  currentEMA: number,
  eventTime: number,
  interval: string
) => {
  const intervals = ["15m", "1h", "4h"];
  if (!intervals.includes(interval)) return;

  if (!tfState.rsiValue || (tfState.rsiValue >= 30 && tfState.rsiValue <= 70)) {
    return;
  }
  const isSended = await SupabaseCoinRepository.checkRecentRsiAlerts(
    eventSymbol,
    interval
  );
  if (isSended) return;
  const id = CoinMap[eventSymbol];
  if (!id) return;

  await lucaWebhook({
    id,
    rsi: tfState.rsiValue,
    ema: currentEMA,
    date: new Date(eventTime),
    interval: interval,
  });
};

main().catch((error) => {
  console.error("Erro fatal na aplicação:", error);
  process.exit(1);
});
