/**
 * Amazon Prime Video handler
 */

import type { ControllerPositioning } from '../types/site-handlers.ts';

window.VSC = window.VSC || {};

class AmazonHandler extends window.VSC.BaseSiteHandler {
  /**
   * Check if this handler applies to Amazon
   * @returns {boolean} True if on Amazon
   */
  static matches(): boolean {
    return (
      location.hostname === 'www.amazon.com' ||
      location.hostname === 'www.primevideo.com' ||
      location.hostname.includes('amazon.') ||
      location.hostname.includes('primevideo.')
    );
  }

  /**
   * Get Amazon-specific controller positioning
   * @param {HTMLElement} parent - Parent element
   * @param {HTMLElement} video - Video element
   * @returns {Object} Positioning information
   */
  getControllerPosition(parent: HTMLElement, video: HTMLMediaElement): ControllerPositioning {
    // Only special-case Prime Video, not product-page videos (which use "vjs-tech")
    // Otherwise the overlay disappears in fullscreen mode
    if (!video.classList.contains('vjs-tech')) {
      return {
        insertionPoint: parent.parentElement || parent,
        insertionMethod: 'beforeParent',
        targetParent: parent.parentElement || parent,
      };
    }

    // Default positioning for product videos
    return super.getControllerPosition(parent, video);
  }

  /**
   * Check if video should be ignored on Amazon
   * @param {HTMLMediaElement} video - Video element
   * @returns {boolean} True if video should be ignored
   */
  shouldIgnoreVideo(video: HTMLMediaElement): boolean {
    // Don't reject videos that are still loading
    if (video.readyState < 2) {
      return false;
    }

    // Ignore product preview videos that are too small
    const rect = video.getBoundingClientRect();
    return rect.width < 200 || rect.height < 100;
  }

  /**
   * Get Amazon-specific video container selectors
   * @returns {Array<string>} CSS selectors
   */
  getVideoContainerSelectors(): string[] {
    return ['.dv-player-container', '.webPlayerContainer', '[data-testid="video-player"]'];
  }
}

// Create singleton instance
window.VSC.AmazonHandler = AmazonHandler;
