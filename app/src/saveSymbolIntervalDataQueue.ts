import { HistoricalKlineData } from "./interfaces";
import { SupabaseCoinRepository } from "./supabase/SupabaseCoinRepository";

export type SaveSymbolIntervalDataTask = {
  eventSymbol: string;
  interval: string;
  newKlineData: HistoricalKlineData;
};

const saveSymbolIntervalDataQueue: SaveSymbolIntervalDataTask[] = [];
let isProcessingSaveQueue = false;

async function processSaveSymbolIntervalDataQueue() {
  if (isProcessingSaveQueue) return;
  isProcessingSaveQueue = true;
  while (saveSymbolIntervalDataQueue.length > 0) {
    const task = saveSymbolIntervalDataQueue.shift();
    if (task) {
      try {
        console.log("Processing save task:", task.eventSymbol, task.interval);
        await SupabaseCoinRepository.saveSymbolIntervalData(
          task.eventSymbol,
          task.interval,
          task.newKlineData
        );
      } catch (e) {
        enqueueSaveSymbolIntervalData(
          task.eventSymbol,
          task.interval,
          task.newKlineData
        );
        console.error("Falha ao salvar histórico:", e);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  isProcessingSaveQueue = false;
}

export const enqueueSaveSymbolIntervalData = (
  eventSymbol: string,
  interval: string,
  newKlineData: HistoricalKlineData
) => {
  //   console.log("Enqueueing save task:", eventSymbol, interval, newKlineData);
  saveSymbolIntervalDataQueue.push({ eventSymbol, interval, newKlineData });
  processSaveSymbolIntervalDataQueue();
};
