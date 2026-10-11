import { CoinMap } from "../coinMap";
import { QueueManager } from "./QueueManager";
import { webhookList } from "../webhook";
interface Task {
  eventSymbol: string; interval: string; date: number; direction: "BULLISH" | "BEARISH";
  confirmationPrice: number; rsi: number | null; ema: number | null;
  atr: number | null; relativeVolume: number | null;
}
export const webhookQueue = new QueueManager<Task>(async event => {
  await webhookList({
    id: CoinMap[event.eventSymbol] ?? event.eventSymbol.toLowerCase(),
    symbol: event.eventSymbol, type: "DIVERGENCE_CONFIRMED",
    direction: event.direction, confirmationPrice: event.confirmationPrice,
    rsi: event.rsi, ema: event.ema, atr: event.atr,
    relativeVolume: event.relativeVolume, date: new Date(event.date).toISOString(),
    interval: event.interval,
    eventId: `${event.eventSymbol}:${event.interval}:${event.direction}:${event.date}`
  });
}, 1000);
