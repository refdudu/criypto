// src/queue/QueueManager.ts
type QueueTask<T> = T;
type QueueProcessor<T> = (task: T) => Promise<void>;

export class QueueManager<T> {
  private queue: QueueTask<T>[] = [];
  private isProcessing = false;
  private processor: QueueProcessor<T>;
  private time: number;

  constructor(processor: QueueProcessor<T>, time: number = 100) {
    this.processor = processor;
    this.time = time;
  }

  enqueue(task: QueueTask<T>) {
    this.queue.push(task);
    this.process();
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await this.processor(task);
      } catch (e) {
        console.error("Erro ao processar tarefa da fila:", e);
        this.queue.push(task); // re-enfileira para tentar novamente
        await new Promise((r) => setTimeout(r, 500));
      }
      await new Promise((r) => setTimeout(r, this.time));
    }
    this.isProcessing = false;
  }
}
