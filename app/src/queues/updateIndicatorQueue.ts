import { SupabaseCoinRepository, IndicatorSnapshot } from "../supabase/SupabaseCoinRepository";
import { QueueManager } from "./QueueManager";
interface Task { eventSymbol: string; interval: string; tfState: IndicatorSnapshot }
export const updateIndicatorQueue = new QueueManager<Task>(task =>
  SupabaseCoinRepository.updateIndicatorState(task.eventSymbol, task.interval, task.tfState), 100);
