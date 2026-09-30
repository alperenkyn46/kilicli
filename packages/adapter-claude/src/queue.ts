/** Adapter-local bounded producer/consumer bridge; never authoritative state. */
export class Queue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private waiter: ((value: IteratorResult<T>) => void) | null = null;
  private ended = false;
  push(value: T): void {
    if (this.ended) throw new Error("Stream is closed");
    if (this.waiter) { const resolve = this.waiter; this.waiter = null; resolve({ value, done: false }); }
    else {
      if (this.values.length >= 4096) throw new Error("Runtime stream buffer exceeded");
      this.values.push(value);
    }
  }
  close(): void {
    this.ended = true;
    this.waiter?.({ value: undefined, done: true });
    this.waiter = null;
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: async () => {
      const value = this.values.shift();
      if (value !== undefined) return { value, done: false };
      if (this.ended) return { value: undefined, done: true };
      if (this.waiter) throw new Error("Concurrent stream consumers are forbidden");
      return new Promise((resolve) => { this.waiter = resolve; });
    } };
  }
}
