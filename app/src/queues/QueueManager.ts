type QueueProcessor<T> = (task: T) => Promise<void>;
interface Queued<T> { task: T; attempts: number }
/** Bounded retries prevent one permanent failure from blocking subsequent tasks. In-memory queue. */
export class QueueManager<T> {
  private queue: Queued<T>[] = [];
  private isProcessing = false;
  constructor(private processor: QueueProcessor<T>, private delayMs = 100, private maxAttempts = 5) {}
  enqueue(task: T) {
    this.queue.push({ task, attempts: 0 });
    void this.process();
  }
  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift()!;
        try {
          await this.processor(item.task);
        } catch (error) {
          item.attempts++;
          if (item.attempts < this.maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, Math.min(30_000, 500 * 2 ** (item.attempts - 1))));
            this.queue.unshift(item); // Keep writes in chronological order.
          } else {
            console.error("Queue task permanently failed after bounded retries:", error, item.task);
          }
        }
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    } finally {
      this.isProcessing = false;
      if (this.queue.length) void this.process();
    }
  }
}
