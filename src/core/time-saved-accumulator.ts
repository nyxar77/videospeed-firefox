export interface TimeSavedStore {
  read(): Promise<number>;
  write(milliseconds: number): Promise<void>;
}

/** Serialize read-modify-write updates so reports from multiple tabs add safely. */
export class TimeSavedAccumulator {
  private writes = Promise.resolve();

  constructor(private readonly store: TimeSavedStore) {}

  add(milliseconds: number): Promise<void> {
    this.writes = this.writes.then(async () => {
      const existing = await this.store.read();
      await this.store.write(existing + milliseconds);
    });
    return this.writes;
  }

  reset(): Promise<void> {
    this.writes = this.writes.then(() => this.store.write(0));
    return this.writes;
  }
}
