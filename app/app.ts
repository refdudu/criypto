import Binance from "node-binance-api";
import { KlineEvent } from "./interfaces";
import { readFile, writeFile } from "node:fs/promises";
import "dotenv/config";

const listOfSymbols = ["BTCUSDT"];
// const listOfSymbols = ["BTCUSDT", "ETHUSDT"];
const klineInterval = "1m";

const getClosePriceHistoryForRSI = () => {
  // Função para obter o histórico de preços de fechamento para o RSI
  return readFile("./closePriceHistoryForRSI.json", "utf-8")
    .then((data) => JSON.parse(data))
    .catch((error) => {
      console.error("Erro ao ler o arquivo de histórico de preços:", error);
      return [];
    });
};
// const setEmaHistory = async (data: number[]) => {
//   return writeFile("./emaHistory.json", JSON.stringify(data)).then(() =>
//     console.log("setEmaHistory")
//   );
// };
const addEmaHistory = async (data: number) => {
  const existingData = await getEmaHistory();
  const newData = [...existingData, data];
  await writeFile("./emaHistory.json", JSON.stringify(newData)).then(() =>
    console.log("addEmaHistory")
  );
  return newData;
};
const getEmaHistory = () => {
  return readFile("./emaHistory.json", "utf-8")
    .then((data) => JSON.parse(data))
    .catch((error) => {
      console.error("Erro ao ler o arquivo de histórico de preços:", error);
      return [];
    });
};
const addClosePriceHistoryForRSI = async (data: number) => {
  const existingData = await getClosePriceHistoryForRSI();
  const newData = [...existingData, data];
  await writeFile(
    "./closePriceHistoryForRSI.json",
    JSON.stringify(newData)
  ).then(() => console.log("setClosePriceHistoryForRSI"));
  return newData;
};

const main = async () => {
  let allClosePriceHistoryForRSI: number[] = await getClosePriceHistoryForRSI();

  // --- Lógica para Cálculo da MME (EMA) ---
  const emaPeriod = 21;
  const emaMultiplier = 2 / (emaPeriod + 1);
  let emaHistory: number[] = await getEmaHistory(); // Array para armazenar o histórico de MMEs calculadas
  let closedKlineCountForEMA = 0; // Contador de velas fechadas para inicializar a MME

  // --- Lógica para Cálculo do RSI (Índice de Força Relativa) ---
  const rsiPeriod = 14; // Período comum para RSI

  // Histórico de preços de fechamento para RSI
  let previousAverageGain: number | null = null;
  let previousAverageLoss: number | null = null;
  let rsiValue: number | null = null;
  const handleKlineDataWithIndicators = async (
    klineData: KlineEvent
  ): Promise<void> => {
    // console.log("🚀 ~ main ~ klineData:", klineData)
    const symbol = klineData.s;
    const kline = klineData.k;
    const eventTime = new Date(klineData.E).toLocaleTimeString("pt-BR");
    const closePrice = parseFloat(kline.c);

    // console.log(`\n--- [${symbol} @ ${eventTime} | Intervalo: ${kline.i}] ---`);
    // console.log(`Preço de Fechamento: ${closePrice.toFixed(2)}`);
    // console.log(
    //   `Abertura: ${parseFloat(kline.o).toFixed(2)}, Máxima: ${parseFloat(
    //     kline.h
    //   ).toFixed(2)}, Mínima: ${parseFloat(kline.l).toFixed(2)}`
    // );
    // console.log(`Vela Fechada? ${kline.x ? "Sim" : "Não"}`);

    // Calcular indicadores apenas para velas fechadas
    if (!kline.x) return;
    // --- Cálculo da MME (EMA) ---
    closedKlineCountForEMA++;
    let currentEMA: number;

    if (closedKlineCountForEMA === 1 || emaHistory.length === 0) {
      currentEMA = closePrice;
      console.log(
        `Primeira MME(${emaPeriod}) calculada (igual ao preço de fechamento).`
      );
    } else {
      const previousEMA = emaHistory[emaHistory.length - 1];
      currentEMA =
        closePrice * emaMultiplier + previousEMA * (1 - emaMultiplier);
    }
    emaHistory = await addEmaHistory(currentEMA);
    console.log(`MME(${emaPeriod}) calculada: ${currentEMA.toFixed(4)}`);

    // --- Cálculo do RSI ---
    allClosePriceHistoryForRSI = await addClosePriceHistoryForRSI(closePrice);

    // Manter o histórico de preços para o RSI com o tamanho necessário (rsiPeriod + 1 para ter rsiPeriod mudanças)
    //   if (closePriceHistoryForRSI.length > rsiPeriod + 1) {
    //     closePriceHistoryForRSI.shift(); // Remove o preço mais antigo
    //   }

    const closePriceHistoryForRSI: number[] = allClosePriceHistoryForRSI.slice(
      -rsiPeriod - 1
    );
    if (closePriceHistoryForRSI.length < 14) return;

    const priceChanges: number[] = [];
    for (let i = 1; i < closePriceHistoryForRSI.length; i++) {
      priceChanges.push(
        closePriceHistoryForRSI[i] - closePriceHistoryForRSI[i - 1]
      );
    }

    const gains: number[] = priceChanges.map((change) =>
      change > 0 ? change : 0
    );
    const losses: number[] = priceChanges.map((change) =>
      change < 0 ? Math.abs(change) : 0
    );

    let currentAverageGain: number;
    let currentAverageLoss: number;

    if (previousAverageGain === null || previousAverageLoss === null) {
      // Cálculo inicial da média de ganhos e perdas
      currentAverageGain = gains.reduce((sum, val) => sum + val, 0) / rsiPeriod;
      currentAverageLoss =
        losses.reduce((sum, val) => sum + val, 0) / rsiPeriod;
    } else {
      // Cálculo suavizado (smoothed)
      currentAverageGain =
        (previousAverageGain * (rsiPeriod - 1) + gains[gains.length - 1]) /
        rsiPeriod;
      currentAverageLoss =
        (previousAverageLoss * (rsiPeriod - 1) + losses[losses.length - 1]) /
        rsiPeriod;
    }

    previousAverageGain = currentAverageGain; // Atualiza para a próxima iteração
    previousAverageLoss = currentAverageLoss; // Atualiza para a próxima iteração

    if (currentAverageLoss === 0) {
      rsiValue = 100; // Se não houver perdas, RSI é 100
    } else {
      const rs = currentAverageGain / currentAverageLoss; // Relative Strength
      rsiValue = 100 - 100 / (1 + rs);
    }
    console.log(`RSI(${rsiPeriod}) calculado: ${rsiValue.toFixed(2)}`);

    // Verificar a condição do RSI
    if (rsiValue < 30) {
      console.warn(
        `ALERTA RSI (${symbol}): RSI (${rsiValue.toFixed(
          2
        )}) está ABAIXO de 30! Hora de agir!`
      );
      // Aqui você pode adicionar a lógica para "fazer algo", como:
      // - Enviar uma notificação (email, Telegram, etc.)
      // - Registrar o evento num banco de dados
      // - Disparar uma ordem de compra (se for um bot de trading, com muito cuidado e testes!)
    }
  };
  const binance = new Binance({
    APIKEY: process.env.BINANCE_API_KEY,
    APISECRET: process.env.BINANCE_API_SECRET,
    // test: true,
  });

  //   const handleKlineDataWithEMA = (klineData: KlineEvent): void => {
  //     // --- Lógica para Cálculo da MME (EMA) ---
  //     const emaPeriod = 21;
  //     const multiplier = 2 / (emaPeriod + 1);
  //     let emaHistory: number[] = []; // Array para armazenar o histórico de MMEs calculadas
  //     let closedKlineCount = 0; // Contador de velas fechadas para inicializar a MME

  //     const symbol = klineData.s;
  //     const kline = klineData.k;
  //     const eventTime = new Date(klineData.E).toLocaleTimeString("pt-BR");
  //     const closePrice = parseFloat(kline.c);

  //     console.log(`\n--- [${symbol} @ ${eventTime} | Intervalo: ${kline.i}] ---`);
  //     console.log(`Preço de Fechamento: ${closePrice.toFixed(2)}`);
  //     console.log(
  //       `Abertura: ${parseFloat(kline.o).toFixed(2)}, Máxima: ${parseFloat(
  //         kline.h
  //       ).toFixed(2)}, Mínima: ${parseFloat(kline.l).toFixed(2)}`
  //     );
  //     console.log(`Vela Fechada? ${kline.x ? "Sim" : "Não"}`);

  //     // Calcular MME apenas para velas fechadas
  //     if (kline.x) {
  //       closedKlineCount++;
  //       let currentEMA: number;

  //       if (closedKlineCount === 1 || emaHistory.length === 0) {
  //         // Para o primeiro período (ou se o histórico estiver vazio por algum motivo), a MME é o preço de fechamento.
  //         currentEMA = closePrice;
  //         console.log(
  //           `Primeira MME(${emaPeriod}) calculada (igual ao preço de fechamento).`
  //         );
  //       } else {
  //         // Busca a MME anterior
  //         const previousEMA = emaHistory[emaHistory.length - 1];
  //         // Fórmula da MME: (Preço de fechamento t * Multiplicador) + (MMEt-1 * (1 - Multiplicador))
  //         currentEMA = closePrice * multiplier + previousEMA * (1 - multiplier);
  //       }

  //       emaHistory.push(currentEMA);
  //       console.log(`MME(${emaPeriod}) calculada: ${currentEMA.toFixed(4)}`); // Exibe com 4 casas decimais para precisão
  //     }
  //   };

  binance.websockets.candlesticks(
    listOfSymbols,
    klineInterval,
    handleKlineDataWithIndicators
  );
  //   const exchangeInfo: { symbol: string }[] = await binance.exchangeInfo();
  //   console.log(exchangeInfo.)
};
main().then(console.log).catch(console.error);
