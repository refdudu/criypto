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
import { webhook } from "./webhook";

export const config = {
  dynamicSymbols: {
    enabled: true,
    // topNGainers: 100,
    quoteAsset: "USDT",
    minVolume24h: 666_666, // 50 mil em volume de USDT
    fallbackSymbols: ["BTCUSDT", "ETHUSDT"], // Símbolos para monitorar se a busca dinâmica estiver desabilitada
  },
//   intervals: ["5m", "15m", "1h", "4h"],
  intervals: ["5m", "15m", "1h"],
  emaPeriod: 21,
  rsiPeriod: 14,
  historyFetchLimit: 200,
};

const webhookQueue: Array<{
  eventSymbol: string;
  rsi: number | null;
  currentEMA: number;
  eventTime: number;
  interval: string;
}> = [];
let isProcessingQueue = false;

// --- Estado em Memória para os Indicadores ---
// Mantém os valores necessários para o cálculo contínuo (suavizado) do RSI
let indicatorStates: DataSymbolsState = {};

// --- Função para Buscar Top Gainers (Mantida) ---

function enqueueWebhook(
  eventSymbol: string,
  rsi: number | null,
  currentEMA: number,
  eventTime: number,
  interval: string
) {
  webhookQueue.push({ eventSymbol, rsi, currentEMA, eventTime, interval });
  processWebhookQueue();
}

async function processWebhookQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (webhookQueue.length > 0) {
    const item = webhookQueue.shift();
    if (item) {
      await sendWebhook(
        item.eventSymbol,
        item.rsi,
        item.currentEMA,
        item.eventTime,
        item.interval
      );
      // Aguarda 1 minuto antes de processar o próximo
      await new Promise((resolve) => setTimeout(resolve, 60_000));
    }
  }
  isProcessingQueue = false;
}

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
    const data = Object.entries(indicatorStates)
      .map(([symbol, intervals]) => ({
        symbol,
        intervals: Object.keys(intervals),
      }))
      .flatMap(({ intervals, symbol }) =>
        intervals.map((interval) => ({
          symbol,
          interval,
        }))
      );
    const promises = data.map(async (x) => {
      const data = await SupabaseCoinRepository.checkRecentRsiAlerts(
        x.symbol,
        x.interval
      ).catch(console.error);
      return { ...data, x };
    });
    const _data = [];
    for (const promise of promises) {
      _data.push(await promise);
    }
    res.status(200).send(_data);
  });
  app.post("/:symbol", async (req, res) => {
    const { symbol } = req.params;
    const { rsiValue, emaValue, interval } = req.body;
    try {
      await sendWebhook(
        symbol,
        rsiValue || null,
        emaValue || null,
        Date.now(),
        interval
      );
      res.status(200).send("ok");
    } catch (e) {
      console.error("Erro ao enviar webhook:", e);
      res.status(500).send("Erro interno");
    }
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

// --- FUNÇÃO PRINCIPAL MODIFICADA ---
const handleKlineData = async (klinePayload: KlineEvent): Promise<void> => {
  const { s: eventSymbol, k: kline, E: eventTime } = klinePayload;
  if (!kline.x) return; // Processar apenas em velas fechadas

  const interval = kline.i;
  const closePrice = parseFloat(kline.c);
  const highPrice = parseFloat(kline.h);
  const lowPrice = parseFloat(kline.l);
  const klineTimestamp = kline.t;

  if (!indicatorStates[eventSymbol]?.[interval]) {
    console.warn(
      `Estado para ${eventSymbol}@${interval} não foi pré-carregado. Ignorando.`
    );
    return;
  }

  const tfState = indicatorStates[eventSymbol][interval];
  let stateChanged = false;

  // 1. ATUALIZAR HISTÓRICO E CALCULAR INDICADORES
  const newKlineData: HistoricalKlineData = {
    closePrice,
    openPrice: parseFloat(kline.o),
    highPrice,
    lowPrice,
    timestamp: new Date(klineTimestamp).toISOString(),
    emaValue: null,
    rsiValue: null,
  };
  tfState.klineHistory = tfState.klineHistory || [];
  tfState.klineHistory.push(newKlineData);
  if (tfState.klineHistory.length > config.historyFetchLimit) {
    tfState.klineHistory.shift();
  }

  // --- Cálculo de EMA ---
  const closePrices = tfState.klineHistory.map((k) => k.closePrice);
  const emaPeriod = config.emaPeriod;
  let currentEMA = closePrices[closePrices.length - 1];
  if (closePrices.length >= emaPeriod) {
    if (!tfState.emaHistory || tfState.emaHistory.length === 0) {
      // Primeira média: média simples
      const sma =
        closePrices.slice(-emaPeriod).reduce((a, b) => a + b, 0) / emaPeriod;
      currentEMA = sma;
    } else {
      const multiplier = 2 / (emaPeriod + 1);
      currentEMA =
        (closePrices[closePrices.length - 1] -
          tfState.emaHistory[tfState.emaHistory.length - 1]) *
          multiplier +
        tfState.emaHistory[tfState.emaHistory.length - 1];
    }
    tfState.emaHistory = tfState.emaHistory || [];
    tfState.emaHistory.push(currentEMA);
    if (tfState.emaHistory.length > config.historyFetchLimit)
      tfState.emaHistory.shift();
  }
  tfState.emaValue = currentEMA;
  newKlineData.emaValue = currentEMA;

  // --- Cálculo de RSI ---
  const rsiPeriod = config.rsiPeriod;
  if (closePrices.length > rsiPeriod) {
    const priceChanges = closePrices
      .slice(-rsiPeriod - 1)
      .map((v, i, arr) => (i === 0 ? 0 : v - arr[i - 1]))
      .slice(1);
    const gains = priceChanges.map((c) => (c > 0 ? c : 0));
    const losses = priceChanges.map((c) => (c < 0 ? Math.abs(c) : 0));
    let avgGain, avgLoss;
    if (
      tfState.previousAverageGain == null ||
      tfState.previousAverageLoss == null
    ) {
      avgGain = gains.reduce((a, b) => a + b, 0) / rsiPeriod;
      avgLoss = losses.reduce((a, b) => a + b, 0) / rsiPeriod;
    } else {
      avgGain =
        (tfState.previousAverageGain * (rsiPeriod - 1) +
          gains[gains.length - 1]) /
        rsiPeriod;
      avgLoss =
        (tfState.previousAverageLoss * (rsiPeriod - 1) +
          losses[losses.length - 1]) /
        rsiPeriod;
    }
    tfState.previousAverageGain = avgGain;
    tfState.previousAverageLoss = avgLoss;
    let rsi = 100;
    if (avgLoss !== 0) {
      const rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
    }
    tfState.rsiValue = rsi;
    newKlineData.rsiValue = rsi;
  }

  if (!tfState.rsiValue) return; // Precisa de RSI para continuar

  // 2. LÓGICA DE CONFIRMAÇÃO DE DIVERGÊNCIA ARMADA
  if (tfState.armedDivergence) {
    const { type, confirmationPrice, armedAtTimestamp } =
      tfState.armedDivergence;
    const intervalMs =
      parseInt(interval.slice(0, -1)) *
      (interval.endsWith("m") ? 60 : 3600) *
      1000;
    if (klineTimestamp - armedAtTimestamp > 14 * intervalMs) {
      console.log(
        `[INFO] Divergência ${type} para ${eventSymbol}@${interval} expirou. Sinal cancelado.`
      );
      tfState.armedDivergence = null;
      stateChanged = true;
    } else {
      if (type === "BULLISH" && highPrice > confirmationPrice) {
        console.log(
          `%c[ALERTA CONFIRMADO] DIVERGÊNCIA DE ALTA para ${eventSymbol}@${interval}! Preço rompeu ${confirmationPrice}`,
          "color: green; font-weight: bold;"
        );
        webhook({
          id: CoinMap[eventSymbol],
          rsi: tfState.rsiValue,
          ema: tfState.emaValue,
          date: new Date(eventTime),
          interval: interval,
          type: "BULLISH",
        });
        // ENVIAR WEBHOOK DE COMPRA/ALTA
        // sendDivergenceAlert(...);
        tfState.armedDivergence = null;
        tfState.lastLow = null;
        stateChanged = true;
      } else if (type === "BEARISH" && lowPrice < confirmationPrice) {
        console.log(
          `%c[ALERTA CONFIRMADO] DIVERGÊNCIA DE BAIXA para ${eventSymbol}@${interval}! Preço rompeu ${confirmationPrice}`,
          "color: red; font-weight: bold;"
        );
        // ENVIAR WEBHOOK DE VENDA/BAIXA
        // sendDivergenceAlert(...);
        tfState.armedDivergence = null;
        tfState.lastHigh = null;
        stateChanged = true;
        webhook({
          id: CoinMap[eventSymbol],
          rsi: tfState.rsiValue,
          ema: tfState.emaValue,
          date: new Date(eventTime),
          interval: interval,
          type: "BEARISH",
        });
      }
    }
  }

  // 3. LÓGICA DE DETECÇÃO E ARME DE NOVAS DIVERGÊNCIAS
  if (!tfState.armedDivergence) {
    // DIVERGÊNCIA DE BAIXA
    if (tfState.rsiValue > 70) {
      if (
        tfState.lastHigh &&
        highPrice > tfState.lastHigh.price &&
        tfState.rsiValue < tfState.lastHigh.rsi
      ) {
        const historySlice = tfState.klineHistory.filter(
          (k) => new Date(k.timestamp).getTime() > tfState.lastHigh!.timestamp
        );
        const confirmationPrice = Math.min(
          ...historySlice.map((k) => k.lowPrice)
        );
        console.log(
          `%c[SINAL ARMADO] Potencial Divergência de BAIXA para ${eventSymbol}@${interval}. Aguardando quebra de ${confirmationPrice}`,
          "color: orange;"
        );
        tfState.armedDivergence = {
          type: "BEARISH",
          confirmationPrice,
          armedAtTimestamp: klineTimestamp,
        };
        stateChanged = true;
      }
      if (!tfState.lastHigh || tfState.rsiValue > tfState.lastHigh.rsi) {
        tfState.lastHigh = {
          price: highPrice,
          rsi: tfState.rsiValue,
          timestamp: klineTimestamp,
        };
        stateChanged = true;
      }
    }
    // DIVERGÊNCIA DE ALTA
    if (tfState.rsiValue < 30) {
      if (
        tfState.lastLow &&
        lowPrice < tfState.lastLow.price &&
        tfState.rsiValue > tfState.lastLow.rsi
      ) {
        const historySlice = tfState.klineHistory.filter(
          (k) => new Date(k.timestamp).getTime() > tfState.lastLow!.timestamp
        );
        const confirmationPrice = Math.max(
          ...historySlice.map((k) => k.highPrice)
        );
        console.log(
          `%c[SINAL ARMADO] Potencial Divergência de ALTA para ${eventSymbol}@${interval}. Aguardando quebra de ${confirmationPrice}`,
          "color: cyan;"
        );
        tfState.armedDivergence = {
          type: "BULLISH",
          confirmationPrice,
          armedAtTimestamp: klineTimestamp,
        };
        stateChanged = true;
      }
      if (!tfState.lastLow || tfState.rsiValue < tfState.lastLow.rsi) {
        tfState.lastLow = {
          price: lowPrice,
          rsi: tfState.rsiValue,
          timestamp: klineTimestamp,
        };
        stateChanged = true;
      }
    }
  }

  // 4. PERSISTIR O ESTADO SE HOUVE MUDANÇA
  if (stateChanged) {
    await SupabaseCoinRepository.updateIndicatorState(
      eventSymbol,
      interval,
      tfState
    ).catch((e) => console.error("Falha ao salvar estado:", e));
  }

  // 5. Salvar histórico e chamar webhook original
  try {
    await SupabaseCoinRepository.saveSymbolIntervalData(
      eventSymbol,
      interval,
      newKlineData
    );
    enqueueWebhook(
      eventSymbol,
      tfState.rsiValue,
      tfState.emaValue,
      eventTime,
      interval
    );
  } catch {}
};

const sendWebhook = async (
  eventSymbol: string,
  rsi: number | null,
  currentEMA: number,
  eventTime: number,
  interval: string
) => {
  const intervals = ["15m", "1h", "4h"];
  if (!intervals.includes(interval)) return;

  if (!rsi || (rsi >= 30 && rsi <= 70)) {
    return;
  }
  console.log("Verificando se deve enviar alerta", eventSymbol, interval);
  const f = (id: string) =>
    lucaWebhook({
      id,
      rsi,
      ema: currentEMA,
      date: new Date(eventTime),
      interval: interval,
    });

  try {
    const isSended = await SupabaseCoinRepository.checkRecentRsiAlerts(
      eventSymbol,
      interval
    );

    console.log("Item do alerta", isSended);
    if (isSended) return;

    console.log("Enviando alerta", eventSymbol, interval);
    const id = CoinMap[eventSymbol];
    if (!id) return;
    await f(id);
  } catch {
    const id = CoinMap[eventSymbol];
    await f(id);
  }
};

main().catch((error) => {
  console.error("Erro fatal na aplicação:", error);
  process.exit(1);
});
