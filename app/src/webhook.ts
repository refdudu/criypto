import "dotenv/config";
/** Non-2xx responses and network errors reach the queue retry handler. Receivers should deduplicate eventId. */
async function webhook(url: string, body: object): Promise<void> {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status} from ${new URL(url).host}`);
}
export async function webhookList(body: object): Promise<void> {
  const destinations = [process.env.LUCA_WEBHOOK_URL, process.env.WEBHOOK_SITE].filter(
    (value): value is string => Boolean(value)
  );
  const results = await Promise.allSettled(destinations.map(url => webhook(url, body)));
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(f => (f as PromiseRejectedResult).reason),
    `${failures.length} webhook destination(s) failed`);
}
