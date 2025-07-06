import { SupabaseCoinRepository } from "../supabase/SupabaseCoinRepository";
import { QueueManager } from "./QueueManager";


const update = ({
  eventSymbol,
  interval,
  tfState,
}: {
  eventSymbol: string;
  interval: string;
  tfState: any;
}) =>
  SupabaseCoinRepository.updateIndicatorState(eventSymbol, interval, tfState)
    .catch((e) => console.error("Falha ao salvar estado:", e))
    .then(() =>
      console.log(`Estado atualizado para ${eventSymbol}@${interval}`)
    );
export const updateIndicatorQueue = new QueueManager(update, 100);
