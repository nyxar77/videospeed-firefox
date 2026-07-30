/**
 * Media element observer for finding and tracking video/audio elements
 */

import type { SiteHandler } from '../types/site-handlers.ts';

interface MediaObserverConfig {
  settings: { audioBoolean: boolean };
}

window.VSC = window.VSC || {};

class MediaElementObserver {
  config: MediaObserverConfig;
  siteHandler: SiteHandler;

  constructor(config: MediaObserverConfig, siteHandler: SiteHandler) {
    this.config = config;
    this.siteHandler = siteHandler;
  }

  /**
   * Scan document for existing media elements
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements
   */
  scanForMedia(document: Document): HTMLMediaElement[] {
    const mediaElements: HTMLMediaElement[] = [];
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';

    // Find regular media elements
    const regularMedia = Array.from(
      document.querySelectorAll(mediaTagSelector)
    ) as HTMLMediaElement[];
    mediaElements.push(...regularMedia);

    // Find media elements in shadow DOMs recursively
    function findShadowMedia(root: Document | ShadowRoot, selector: string): HTMLMediaElement[] {
      const results: HTMLMediaElement[] = [];
      // Add any matching elements in current shadow root
      results.push(...(Array.from(root.querySelectorAll(selector)) as HTMLMediaElement[]));
      // Recursively check all elements with shadow roots
      root.querySelectorAll('*').forEach((element: Element) => {
        if (element.shadowRoot) {
          results.push(...findShadowMedia(element.shadowRoot, selector));
        }
      });
      return results;
    }

    const shadowMedia = findShadowMedia(document, mediaTagSelector);
    mediaElements.push(...shadowMedia);

    // Find site-specific media elements
    const siteSpecificMedia = this.siteHandler.detectSpecialVideos(document);
    mediaElements.push(...siteSpecificMedia);

    // Filter out ignored videos
    const filteredMedia = mediaElements.filter((media: HTMLMediaElement) => {
      return !this.siteHandler.shouldIgnoreVideo(media);
    });

    window.VSC.logger.info(
      `Found ${filteredMedia.length} media elements (${mediaElements.length} total, ${mediaElements.length - filteredMedia.length} filtered out)`
    );
    return filteredMedia;
  }

  /**
   * Lightweight scan that avoids expensive shadow DOM traversal
   * Used during initial load to avoid blocking page performance
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements
   */
  scanForMediaLight(document: Document): HTMLMediaElement[] {
    const mediaElements: HTMLMediaElement[] = [];
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';

    try {
      // Only do basic DOM query, no shadow DOM traversal
      const regularMedia = Array.from(
        document.querySelectorAll(mediaTagSelector)
      ) as HTMLMediaElement[];
      mediaElements.push(...regularMedia);

      // Find site-specific media elements (usually lightweight)
      const siteSpecificMedia = this.siteHandler.detectSpecialVideos(document);
      mediaElements.push(...siteSpecificMedia);

      // Filter out ignored videos
      const filteredMedia = mediaElements.filter((media: HTMLMediaElement) => {
        return !this.siteHandler.shouldIgnoreVideo(media);
      });

      window.VSC.logger.info(
        `Light scan found ${filteredMedia.length} media elements (${mediaElements.length} total, ${mediaElements.length - filteredMedia.length} filtered out)`
      );
      return filteredMedia;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      window.VSC.logger.error(`Light media scan failed: ${message}`);
      return [];
    }
  }

  /**
   * Scan iframes for media elements
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements in iframes
   */
  scanIframes(document: Document): HTMLMediaElement[] {
    const mediaElements: HTMLMediaElement[] = [];
    const frameTags = document.getElementsByTagName('iframe');

    Array.prototype.forEach.call(frameTags, (frame: HTMLIFrameElement) => {
      // Ignore frames we don't have permission to access (different origin)
      try {
        const childDocument = frame.contentDocument;
        if (childDocument) {
          const iframeMedia = this.scanForMedia(childDocument);
          mediaElements.push(...iframeMedia);
          window.VSC.logger.debug(`Found ${iframeMedia.length} media elements in iframe`);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        window.VSC.logger.debug(`Cannot access iframe content (cross-origin): ${message}`);
      }
    });

    return mediaElements;
  }

  /**
   * Get media elements using site-specific container selectors
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} Found media elements
   */
  scanSiteSpecificContainers(document: Document): HTMLMediaElement[] {
    const mediaElements: HTMLMediaElement[] = [];
    const containerSelectors = this.siteHandler.getVideoContainerSelectors();
    const audioEnabled = this.config.settings.audioBoolean;

    containerSelectors.forEach((selector) => {
      try {
        const containers = document.querySelectorAll(selector);
        containers.forEach((container: Element) => {
          const containerMedia = window.VSC.DomUtils.findMediaElements(container, audioEnabled);
          mediaElements.push(...containerMedia);
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        window.VSC.logger.warn(`Invalid selector "${selector}": ${message}`);
      }
    });

    return mediaElements;
  }

  /**
   * Comprehensive scan for all media elements
   * @param {Document} document - Document to scan
   * @returns {Array<HTMLMediaElement>} All found media elements
   */
  scanAll(document: Document): HTMLMediaElement[] {
    const allMedia: HTMLMediaElement[] = [];

    // Regular scan
    const regularMedia = this.scanForMedia(document);
    allMedia.push(...regularMedia);

    // Site-specific container scan
    const containerMedia = this.scanSiteSpecificContainers(document);
    allMedia.push(...containerMedia);

    // Iframe scan
    const iframeMedia = this.scanIframes(document);
    allMedia.push(...iframeMedia);

    // Remove duplicates
    const uniqueMedia = [...new Set(allMedia)];

    window.VSC.logger.info(`Total unique media elements found: ${uniqueMedia.length}`);
    return uniqueMedia;
  }

  /**
   * Check if media element is valid for controller attachment
   * @param {HTMLMediaElement} media - Media element to check
   * @returns {boolean} True if valid
   */
  isValidMediaElement(media: HTMLMediaElement): boolean {
    // Skip videos that are not in the DOM
    if (!media.isConnected) {
      window.VSC.logger.debug('Video not in DOM');
      return false;
    }

    // Skip audio elements when audio support is disabled
    if (media.tagName === 'AUDIO' && !this.config.settings.audioBoolean) {
      window.VSC.logger.debug('Audio element rejected - audioBoolean disabled');
      return false;
    }

    // Let site handler have final say on whether to ignore this video
    if (this.siteHandler.shouldIgnoreVideo(media)) {
      window.VSC.logger.debug('Video ignored by site handler');
      return false;
    }

    // Accept all connected media elements that pass site handler validation
    // Visibility and size will be handled by controller initialization
    return true;
  }

  /**
   * Check if media element should start with hidden controller
   * @param {HTMLMediaElement} media - Media element to check
   * @returns {boolean} True if controller should start hidden
   */
  shouldStartHidden(media: HTMLMediaElement): boolean {
    // For audio elements, only hide controller if audio support is disabled
    // Audio players are often intentionally invisible but still functional
    if (media.tagName === 'AUDIO') {
      if (!this.config.settings.audioBoolean) {
        window.VSC.logger.debug('Audio controller hidden - audio support disabled');
        return true;
      }

      // Audio elements can be functional even when invisible
      // Only hide if the audio element is explicitly disabled or has no functionality
      if (
        (media as HTMLMediaElement & { disabled?: boolean }).disabled ||
        media.style.pointerEvents === 'none'
      ) {
        window.VSC.logger.debug('Audio controller hidden - element disabled or no pointer events');
        return true;
      }

      // Keep audio controllers visible even for hidden audio elements
      window.VSC.logger.debug(
        'Audio controller will start visible (audio elements can be invisible but functional)'
      );
      return false;
    }

    // For video elements, check visibility - only hide controllers for truly invisible media elements
    const style = window.getComputedStyle(media);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      window.VSC.logger.debug('Video not visible, controller will start hidden');
      return true;
    }

    // All visible media elements get visible controllers regardless of size
    return false;
  }

  /**
   * Find the best parent element for controller positioning
   * @param {HTMLMediaElement} media - Media element
   * @returns {HTMLElement} Parent element for positioning
   */
  findControllerParent(media: HTMLMediaElement): HTMLElement {
    const positioning = this.siteHandler.getControllerPosition(
      media.parentElement || document.body,
      media
    );
    return positioning.targetParent || media.parentElement || document.body;
  }
}

// Create singleton instance
window.VSC.MediaElementObserver = MediaElementObserver;
