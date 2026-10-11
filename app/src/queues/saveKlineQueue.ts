import { HistoricalKlineData } from "../interfaces";
import { SupabaseCoinRepository } from "../supabase/SupabaseCoinRepository";
import { QueueManager } from "./QueueManager";
interface Task { eventSymbol: string; interval: string; newKlineData: HistoricalKlineData }
export const saveKlineQueue = new QueueManager<Task>(task =>
  SupabaseCoinRepository.saveSymbolIntervalData(task.eventSymbol, task.interval, task.newKlineData), 100);
