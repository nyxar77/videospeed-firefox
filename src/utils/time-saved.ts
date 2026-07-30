export const TIME_SAVED_STORAGE_KEY = 'timeSavedMilliseconds';

const MAX_PLAYBACK_RATE = 16;
const MEDIA_CLOCK_TOLERANCE_SECONDS = 0.25;

/**
 * Calculate time saved from a real watched segment.
 *
 * `mediaSeconds` is the amount of media that actually advanced and
 * `elapsedMilliseconds` is wall-clock time while the media was playing.
 * Seeks and impossible jumps return zero rather than inflating statistics.
 */
export function calculateSavedMilliseconds(
  mediaSeconds: number,
  elapsedMilliseconds: number,
  expectedPlaybackRate: number
): number {
  if (
    !Number.isFinite(mediaSeconds) ||
    !Number.isFinite(elapsedMilliseconds) ||
    mediaSeconds <= 0 ||
    elapsedMilliseconds <= 0 ||
    !Number.isFinite(expectedPlaybackRate) ||
    expectedPlaybackRate <= 0
  ) {
    return 0;
  }

  const elapsedSeconds = elapsedMilliseconds / 1000;
  const expectedMediaSeconds =
    elapsedSeconds * Math.min(Math.max(expectedPlaybackRate, 0.1), MAX_PLAYBACK_RATE);
  // Validate against the rate that was active for this exact segment. Using a
  // global 16x ceiling lets small seeks look like valid speed-ups at 1x.
  if (mediaSeconds > expectedMediaSeconds + MEDIA_CLOCK_TOLERANCE_SECONDS) {
    return 0;
  }

  return Math.max(0, Math.round((mediaSeconds - elapsedSeconds) * 1000));
}

export function formatSavedTime(milliseconds: unknown): string {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
