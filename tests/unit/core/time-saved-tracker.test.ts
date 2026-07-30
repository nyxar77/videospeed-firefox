import { afterEach, describe, expect, it } from 'vitest';
import { TimeSavedTracker } from '../../../src/core/time-saved-tracker.ts';
import { createMockVideo } from '../../helpers/test-utils.ts';

describe('TimeSavedTracker', () => {
  const trackers: TimeSavedTracker[] = [];

  afterEach(() => {
    trackers.splice(0).forEach((tracker) => tracker.remove());
  });

  it('reports only time saved from watched playback', () => {
    let now = 0;
    const video = createMockVideo({ paused: false, currentTime: 0 });
    const tracker = new TimeSavedTracker(video, () => now);
    trackers.push(tracker);
    const deltas: number[] = [];
    const listener = (event: Event) => {
      deltas.push((event as CustomEvent<{ milliseconds: number }>).detail.milliseconds);
    };
    document.documentElement.addEventListener('VSC_ADD_TIME_SAVED', listener);

    now = 5_000;
    video.currentTime = 10;
    video.dispatchEvent({ type: 'pause' } as Event);

    expect(deltas).toEqual([5_000]);
    document.documentElement.removeEventListener('VSC_ADD_TIME_SAVED', listener);
  });

  it('does not count seeking or slower playback as saved time', () => {
    let now = 0;
    const video = createMockVideo({ paused: false, currentTime: 0 });
    const tracker = new TimeSavedTracker(video, () => now);
    trackers.push(tracker);
    const deltas: number[] = [];
    const listener = (event: Event) => {
      deltas.push((event as CustomEvent<{ milliseconds: number }>).detail.milliseconds);
    };
    document.documentElement.addEventListener('VSC_ADD_TIME_SAVED', listener);

    now = 10_000;
    video.currentTime = 5;
    video.dispatchEvent({ type: 'timeupdate' } as Event);
    video.dispatchEvent({ type: 'seeking' } as Event);
    video.currentTime = 500;
    now = 11_000;
    video.dispatchEvent({ type: 'seeked' } as Event);
    video.dispatchEvent({ type: 'pause' } as Event);

    expect(deltas).toEqual([]);
    document.documentElement.removeEventListener('VSC_ADD_TIME_SAVED', listener);
  });
});
