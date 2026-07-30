import { calculateSavedMilliseconds } from '../utils/time-saved.ts';

const FLUSH_INTERVAL_MS = 30_000;

/** Track watched media segments without affecting playback or controller state. */
class TimeSavedTracker {
  video: HTMLMediaElement;
  pendingMilliseconds = 0;
  lastMediaTime = 0;
  lastTimestamp = 0;
  lastFlushTimestamp = 0;
  segmentPlaybackRate = 1;
  tracking = false;
  private readonly now: () => number;
  private readonly handlers: Record<string, EventListener>;

  constructor(video: HTMLMediaElement, now: () => number = () => performance.now()) {
    this.video = video;
    this.now = now;
    this.handlers = {
      play: () => this.begin(),
      playing: () => this.begin(),
      pause: () => this.stop(),
      ended: () => this.stop(),
      seeking: () => this.stopForSeek(),
      seeked: () => this.begin(),
      ratechange: () => this.checkpoint(false),
      timeupdate: () => this.checkpoint(false),
      pagehide: () => this.checkpoint(true),
      visibilitychange: () => this.handleVisibilityChange(),
    };

    for (const type of [
      'play',
      'playing',
      'pause',
      'ended',
      'seeking',
      'seeked',
      'ratechange',
      'timeupdate',
    ]) {
      video.addEventListener(type, this.handlers[type]);
    }
    window.addEventListener('pagehide', this.handlers.pagehide);
    document.addEventListener('visibilitychange', this.handlers.visibilitychange);

    if (!video.paused && !video.seeking) {
      this.begin();
    }
  }

  begin(): void {
    if (this.video.paused || this.video.seeking) {
      return;
    }
    this.tracking = true;
    this.lastMediaTime = this.video.currentTime;
    this.lastTimestamp = this.now();
    this.lastFlushTimestamp = this.lastTimestamp;
    this.segmentPlaybackRate = this.video.playbackRate;
  }

  checkpoint(forceFlush: boolean): void {
    if (!this.tracking) {
      return;
    }

    const timestamp = this.now();
    const mediaDelta = this.video.currentTime - this.lastMediaTime;
    const elapsed = timestamp - this.lastTimestamp;
    this.pendingMilliseconds += calculateSavedMilliseconds(
      mediaDelta,
      elapsed,
      this.segmentPlaybackRate
    );
    this.lastMediaTime = this.video.currentTime;
    this.lastTimestamp = timestamp;
    this.segmentPlaybackRate = this.video.playbackRate;

    if (forceFlush || timestamp - this.lastFlushTimestamp >= FLUSH_INTERVAL_MS) {
      this.flush();
      this.lastFlushTimestamp = timestamp;
    }
  }

  stopForSeek(): void {
    this.checkpoint(true);
    this.tracking = false;
  }

  stop(): void {
    this.checkpoint(true);
    this.tracking = false;
  }

  handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this.checkpoint(true);
    } else {
      this.begin();
    }
  }

  flush(): void {
    // Messages cross a trust boundary where only whole milliseconds are
    // accepted. Round once per batch so fractional performance.now() values
    // cannot silently discard an otherwise valid report.
    const milliseconds = Math.round(this.pendingMilliseconds);
    if (milliseconds <= 0) {
      this.pendingMilliseconds = 0;
      return;
    }
    document.documentElement.dispatchEvent(
      new CustomEvent('VSC_ADD_TIME_SAVED', {
        detail: { milliseconds },
      })
    );
    this.pendingMilliseconds = 0;
  }

  remove(): void {
    this.checkpoint(true);
    for (const type of [
      'play',
      'playing',
      'pause',
      'ended',
      'seeking',
      'seeked',
      'ratechange',
      'timeupdate',
    ]) {
      this.video.removeEventListener(type, this.handlers[type]);
    }
    window.removeEventListener('pagehide', this.handlers.pagehide);
    document.removeEventListener('visibilitychange', this.handlers.visibilitychange);
  }
}

window.VSC = window.VSC || {};
window.VSC.TimeSavedTracker = TimeSavedTracker;

export { TimeSavedTracker };
