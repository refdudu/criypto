import { HistoricalKlineData } from "../interfaces";
import { SupabaseCoinRepository } from "../supabase/SupabaseCoinRepository";
import { QueueManager } from "./QueueManager";

interface SaveKlineQueueTask {
  eventSymbol: string;
  interval: string;
  newKlineData: HistoricalKlineData;
}
export const saveKlineQueue = new QueueManager((task: SaveKlineQueueTask) =>
  SupabaseCoinRepository.saveSymbolIntervalData(
    task.eventSymbol,
    task.interval,
    task.newKlineData
  ).then(() => console.log(`Salvo ${task.eventSymbol}@${task.interval}`))
);
