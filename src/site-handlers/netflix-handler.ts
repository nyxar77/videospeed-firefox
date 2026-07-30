/**
 * Netflix-specific handler
 */

import type { ControllerPositioning } from '../types/site-handlers.ts';

window.VSC = window.VSC || {};

class NetflixHandler extends window.VSC.BaseSiteHandler {
  /**
   * Check if this handler applies to Netflix
   * @returns {boolean} True if on Netflix
   */
  static matches(): boolean {
    return location.hostname === 'www.netflix.com';
  }

  /**
   * Get Netflix-specific controller positioning
   * @param {HTMLElement} parent - Parent element
   * @param {HTMLElement} video - Video element
   * @returns {Object} Positioning information
   */
  getControllerPosition(parent: HTMLElement, _video: HTMLMediaElement): ControllerPositioning {
    // Insert before parent to bypass Netflix's overlay
    return {
      insertionPoint: parent.parentElement || parent,
      insertionMethod: 'beforeParent',
      targetParent: parent.parentElement || parent,
    };
  }

  /**
   * Handle Netflix-specific seeking using their API
   * @param {HTMLMediaElement} video - Video element
   * @param {number} seekSeconds - Seconds to seek
   * @returns {boolean} True if handled
   */
  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean {
    try {
      // Use Netflix's postMessage API for seeking
      window.postMessage(
        {
          action: 'videospeed-seek',
          seekMs: seekSeconds * 1000,
        },
        'https://www.netflix.com'
      );

      window.VSC.logger.debug(`Netflix seek: ${seekSeconds} seconds`);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      window.VSC.logger.error(`Netflix seek failed: ${message}`);
      // Fallback to default seeking
      video.currentTime += seekSeconds;
      return true;
    }
  }

  /**
   * Initialize Netflix-specific functionality
   * @param {Document} document - Document object
   */
  initialize(document: Document): void {
    super.initialize(document);

    // Netflix-specific script injection is handled by the content script because
    // extension APIs are not available in the injected page context.
    window.VSC.logger.debug(
      'Netflix handler initialized - script injection handled by content script'
    );
  }

  /**
   * Check if video should be ignored on Netflix
   * @param {HTMLMediaElement} video - Video element
   * @returns {boolean} True if video should be ignored
   */
  shouldIgnoreVideo(video: HTMLMediaElement): boolean {
    // Ignore preview videos or thumbnails
    return (
      (video.classList.contains('preview-video') ||
        video.parentElement?.classList.contains('billboard-row')) ??
      false
    );
  }

  /**
   * Get Netflix-specific video container selectors
   * @returns {Array<string>} CSS selectors
   */
  getVideoContainerSelectors(): string[] {
    return ['.watch-video', '.nfp-container', '#netflix-player'];
  }
}

// Create singleton instance
window.VSC.NetflixHandler = NetflixHandler;
