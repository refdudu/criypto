import { SupabaseCoinRepository } from "../supabase/SupabaseCoinRepository";
import { configuredWebhookTargets, sendWebhook } from "../webhook";
/** Durable DB outbox. One active worker per backend deployment; receivers should dedupe payload.eventId. */
let running=false;
export async function dispatchPendingSignals():Promise<void>{
  if(running)return;
  running=true;
  try{
    const targets=configuredWebhookTargets();
    if(!targets.length)return; // Keep events pending until destinations are configured.
    const events=await SupabaseCoinRepository.getPendingSignals();
    for(const event of events){
      const delivered=new Set(event.delivered_targets);
      for(const target of targets){
        if(delivered.has(target.key))continue;
        try{
          await sendWebhook(target.url,event.payload);
          delivered.add(target.key);
          // Commit each target independently: retry only destinations not yet marked delivered.
          await SupabaseCoinRepository.markDelivery(event.event_id,[...delivered],
            targets.every(t=>delivered.has(t.key)));
        }catch(error){
          console.error(`Delivery failure ${event.event_id}/${target.key}`,error);
        }
      }
      if(targets.every(t=>delivered.has(t.key)) &&
        event.delivered_targets.length===targets.length) {
        // A legacy event might have been delivered already; ensure it leaves the pending queue.
        await SupabaseCoinRepository.markDelivery(event.event_id,[...delivered],true);
      }
    }
  }finally{running=false;}
}
