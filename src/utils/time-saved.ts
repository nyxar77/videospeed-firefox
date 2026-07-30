export const TIME_SAVED_STORAGE_KEY = 'timeSavedMilliseconds';

const MAX_PLAYBACK_RATE = 16;

/**
 * Calculate time saved from a real watched segment.
 *
 * `mediaSeconds` is the amount of media that actually advanced and
 * `elapsedMilliseconds` is wall-clock time while the media was playing.
 * Seeks and impossible jumps return zero rather than inflating statistics.
 */
export function calculateSavedMilliseconds(
  mediaSeconds: number,
  elapsedMilliseconds: number
): number {
  if (
    !Number.isFinite(mediaSeconds) ||
    !Number.isFinite(elapsedMilliseconds) ||
    mediaSeconds <= 0 ||
    elapsedMilliseconds <= 0
  ) {
    return 0;
  }

  const elapsedSeconds = elapsedMilliseconds / 1000;
  // The extension caps speeds at 16x. Extra leeway accounts for media clock
  // quantization while still rejecting seek jumps that missed an event.
  if (mediaSeconds > elapsedSeconds * MAX_PLAYBACK_RATE + 2) {
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
