import { HistoricalKlineData } from "../interfaces";
import { SupabaseCoinRepository } from "../supabase/SupabaseCoinRepository";
import { QueueManager } from "./QueueManager";

// Fila para salvar histórico
interface SaveKlineQueueTask {
  eventSymbol: string;
  interval: string;
  newKlineData: HistoricalKlineData;
}
export const saveKlineQueue = new QueueManager(
  async (task: SaveKlineQueueTask) => {
    await SupabaseCoinRepository.saveSymbolIntervalData(
      task.eventSymbol,
      task.interval,
      task.newKlineData
    );
  }
);
