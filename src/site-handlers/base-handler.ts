/**
 * Base class for site-specific handlers
 */

import type { ControllerPositioning } from '../types/site-handlers.ts';

window.VSC = window.VSC || {};

class BaseSiteHandler {
  hostname: string;

  constructor() {
    this.hostname = location.hostname;
  }

  /**
   * Check if this handler applies to the current site
   * @returns {boolean} True if handler applies
   */
  static matches() {
    return false; // Override in subclasses
  }

  /**
   * Get the site-specific positioning for the controller
   * @param {HTMLElement} parent - Parent element
   * @param {HTMLElement} video - Video element
   * @returns {Object} Positioning information
   */
  getControllerPosition(parent: HTMLElement, _video: HTMLMediaElement): ControllerPositioning {
    return {
      insertionPoint: parent,
      insertionMethod: 'firstChild', // 'firstChild', 'beforeParent', 'afterParent'
      targetParent: parent,
    };
  }

  /**
   * Handle site-specific speed change.
   * Called whenever the extension sets playback speed (user action, fight-back, etc.).
   * Override to sync with a site's custom player API.
   * @param {HTMLMediaElement} video - Video element
   * @param {number} speed - Target speed
   */
  handleSpeedChange(video: HTMLMediaElement, speed: number): void {
    video.playbackRate = speed;
  }

  /**
   * Handle site-specific seeking functionality
   * @param {HTMLMediaElement} video - Video element
   * @param {number} seekSeconds - Seconds to seek
   * @returns {boolean} True if handled, false for default behavior
   */
  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean {
    // Default implementation - use standard seeking with bounds checking (original logic)
    if (video.currentTime !== undefined && video.duration) {
      const newTime = Math.max(0, Math.min(video.duration, video.currentTime + seekSeconds));
      video.currentTime = newTime;
    } else {
      // Fallback for videos without duration
      video.currentTime += seekSeconds;
    }
    return true;
  }

  /**
   * Handle site-specific initialization
   * @param {Document} document - Document object
   */
  initialize(_document: Document): void {
    window.VSC.logger.debug(`Initializing ${this.constructor.name} for ${this.hostname}`);
  }

  /**
   * Handle site-specific cleanup
   */
  cleanup(): void {
    window.VSC.logger.debug(`Cleaning up ${this.constructor.name}`);
  }

  /**
   * Check if video element should be ignored
   * @param {HTMLMediaElement} video - Video element
   * @returns {boolean} True if video should be ignored
   */
  shouldIgnoreVideo(_video: HTMLMediaElement): boolean {
    return false;
  }

  /**
   * Get site-specific CSS selectors for video containers
   * @returns {Array<string>} CSS selectors
   */
  getVideoContainerSelectors(): string[] {
    return [];
  }

  /**
   * Handle special video detection logic
   * @param {Document} document - Document object
   * @returns {Array<HTMLMediaElement>} Additional videos found
   */
  detectSpecialVideos(_document: Document): HTMLMediaElement[] {
    return [];
  }
}

// Create singleton instance
window.VSC.BaseSiteHandler = BaseSiteHandler;
