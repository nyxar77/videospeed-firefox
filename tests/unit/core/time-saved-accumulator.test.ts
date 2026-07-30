import { describe, expect, it } from 'vitest';
import { TimeSavedAccumulator } from '../../../src/core/time-saved-accumulator.ts';

describe('TimeSavedAccumulator', () => {
  it('serializes concurrent reports without losing any saved time', async () => {
    let total = 1_000;
    const accumulator = new TimeSavedAccumulator({
      read: async () => total,
      write: async (next) => {
        total = next;
      },
    });

    await Promise.all([accumulator.add(500), accumulator.add(1_250), accumulator.add(250)]);

    expect(total).toBe(3_000);
  });
});
