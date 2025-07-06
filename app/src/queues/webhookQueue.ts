import { CoinMap } from "../coinMap";
import { QueueManager } from "./QueueManager";
import { webhookList } from "../webhook";

// const webhookQueue: Array<{

const intervals = ["15m", "1h", "4h"];

interface EnqueueWebhookParams {
  eventSymbol: string;
  rsi: number | null;
  ema: number | null;
  date: number;
  interval: string;
}

const sendWebhook = async ({
  ema: currentEMA,
  eventSymbol,
  date: eventTime,
  interval,
  rsi,
}: EnqueueWebhookParams) => {
  if (!intervals.includes(interval)) return;
  if (!rsi || (rsi >= 30 && rsi <= 70)) return;

  //   console.log("Verificando se deve enviar alerta", eventSymbol, interval);
  const f = (id: string) =>
    webhookList({
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
export const webhookQueue = new QueueManager(sendWebhook, 100);
