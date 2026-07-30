import { describe, expect, it } from 'vitest';
import { calculateSavedMilliseconds, formatSavedTime } from '../../../src/utils/time-saved.ts';

describe('saved time calculations', () => {
  it('counts only the wall-clock time avoided by watched media', () => {
    expect(calculateSavedMilliseconds(10, 5_000, 2)).toBe(5_000);
    expect(calculateSavedMilliseconds(10, 10_000, 1)).toBe(0);
    expect(calculateSavedMilliseconds(5, 10_000, 0.5)).toBe(0);
  });

  it('rejects seek jumps and invalid segments', () => {
    expect(calculateSavedMilliseconds(600, 1_000, 1)).toBe(0);
    expect(calculateSavedMilliseconds(5, 1_000, 1)).toBe(0);
    expect(calculateSavedMilliseconds(-1, 1_000, 1)).toBe(0);
    expect(calculateSavedMilliseconds(1, 0, 1)).toBe(0);
  });

  it('formats a durable total for compact UI surfaces', () => {
    expect(formatSavedTime(0)).toBe('0s');
    expect(formatSavedTime(65_000)).toBe('1m 5s');
    expect(formatSavedTime(7_560_000)).toBe('2h 6m');
  });
});
