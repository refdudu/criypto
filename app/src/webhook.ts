import "dotenv/config";
export type WebhookTarget="luca"|"site";
export function configuredWebhookTargets():Array<{key:WebhookTarget;url:string}> {
  const list:Array<{key:WebhookTarget;url:string}>=[];
  if(process.env.LUCA_WEBHOOK_URL)list.push({key:"luca",url:process.env.LUCA_WEBHOOK_URL});
  if(process.env.WEBHOOK_SITE)list.push({key:"site",url:process.env.WEBHOOK_SITE});
  return list;
}
export async function sendWebhook(url:string,body:object):Promise<void>{
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Webhook HTTP ${response.status} from ${new URL(url).host}`);
}
