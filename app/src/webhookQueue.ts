import { CoinMap } from "./coinMap";
import { SupabaseCoinRepository } from "./supabase/SupabaseCoinRepository";
import { lucaWebhook } from "./webhook";

const webhookQueue: Array<{
  eventSymbol: string;
  rsi: number | null;
  currentEMA: number;
  eventTime: number;
  interval: string;
}> = [];
let isProcessingQueue = false;

const intervals = ["15m", "1h", "4h"];

export const enqueueWebhook = (
  eventSymbol: string,
  rsi: number | null,
  currentEMA: number,
  eventTime: number,
  interval: string
) => {
  if (!intervals.includes(interval)) return;

  console.log(
    "Enqueueing webhook task:",
    eventSymbol,
    rsi,
    currentEMA,
    eventTime,
    interval
  );
  webhookQueue.push({ eventSymbol, rsi, currentEMA, eventTime, interval });
  processWebhookQueue();
};

const processWebhookQueue = async () => {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (webhookQueue.length > 0) {
    const item = webhookQueue.shift();
    if (item) {
      console.log(
        "Processing webhook task:",
        item.eventSymbol,
        item.rsi,
        item.currentEMA,
        item.eventTime,
        item.interval
      );
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
};
const sendWebhook = async (
  eventSymbol: string,
  rsi: number | null,
  currentEMA: number,
  eventTime: number,
  interval: string
) => {
  if (!intervals.includes(interval)) return;
  if (!rsi || (rsi >= 30 && rsi <= 70)) return;

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
    // const isSended = await SupabaseCoinRepository.checkRecentRsiAlerts(
    //   eventSymbol,
    //   interval
    // );

    // console.log("Item do alerta", Boolean(isSended));
    // if (isSended) return;

    console.log("Enviando alerta", eventSymbol, interval);
    const id = CoinMap[eventSymbol];
    if (!id) return;
    await f(id);
  } catch {
    const id = CoinMap[eventSymbol];
    await f(id);
  }
};
