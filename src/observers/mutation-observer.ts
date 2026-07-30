/**
 * DOM mutation observer for detecting video elements
 */

interface MutationObserverConfig {
  settings: { audioBoolean: boolean };
}

interface MediaObserverLike {
  isValidMediaElement(video: HTMLMediaElement): boolean;
}

type VideoFoundCallback = (video: HTMLMediaElement, parent: Node | null) => void;
type VideoRemovedCallback = (video: HTMLMediaElement) => void;

window.VSC = window.VSC || {};

class VideoMutationObserver {
  config: MutationObserverConfig;
  onVideoFound: VideoFoundCallback;
  onVideoRemoved: VideoRemovedCallback;
  mediaObserver: MediaObserverLike;
  observer: MutationObserver | null;
  shadowObservers: Map<ShadowRoot, MutationObserver>;
  pendingMutations: MutationRecord[];
  pendingProcessScheduled: boolean;
  pendingIdleCallback: number | null;
  pendingTimeout: number | null;
  active: boolean;

  constructor(
    config: MutationObserverConfig,
    onVideoFound: VideoFoundCallback,
    onVideoRemoved: VideoRemovedCallback,
    mediaObserver: MediaObserverLike
  ) {
    this.config = config;
    this.onVideoFound = onVideoFound;
    this.onVideoRemoved = onVideoRemoved;
    this.mediaObserver = mediaObserver;
    this.observer = null;
    this.shadowObservers = new Map();
    this.pendingMutations = [];
    this.pendingProcessScheduled = false;
    this.pendingIdleCallback = null;
    this.pendingTimeout = null;
    this.active = false;
  }

  /**
   * Start observing DOM mutations
   * @param {Document} document - Document to observe
   */
  start(document: Document): void {
    this.active = true;
    this.observer = new MutationObserver((mutations: MutationRecord[]) => {
      this.scheduleMutationProcessing(mutations);
    });

    const observerOptions = {
      attributeFilter: ['aria-hidden', 'data-focus-method', 'style', 'class'],
      childList: true,
      subtree: true,
    };

    this.observer.observe(document, observerOptions);
    window.VSC.logger.debug('Video mutation observer started');
  }

  /** Coalesce bursts of page mutations into one idle-time processing pass. */
  scheduleMutationProcessing(mutations: MutationRecord[]): void {
    if (!this.active) {
      return;
    }

    this.pendingMutations.push(...mutations);
    if (this.pendingProcessScheduled) {
      return;
    }

    this.pendingProcessScheduled = true;
    const process = (): void => {
      this.pendingProcessScheduled = false;
      this.pendingIdleCallback = null;
      this.pendingTimeout = null;

      const pending = this.pendingMutations;
      this.pendingMutations = [];
      this.processMutations(pending);
    };

    if (typeof window.requestIdleCallback === 'function') {
      this.pendingIdleCallback = window.requestIdleCallback(process, { timeout: 500 });
    } else {
      this.pendingTimeout = window.setTimeout(process, 0);
    }
  }

  /**
   * Process mutation events
   * @param {Array<MutationRecord>} mutations - Mutation records
   * @private
   */
  processMutations(mutations: MutationRecord[]): void {
    const visibilityTargets = new Set<Element>();
    const mediaToRecheck = new Set<HTMLMediaElement>();

    mutations.forEach((mutation: MutationRecord) => {
      switch (mutation.type) {
        case 'childList':
          this.processChildListMutation(mutation);
          break;
        case 'attributes':
          this.processAttributeMutation(mutation, visibilityTargets, mediaToRecheck);
          break;
      }
    });

    for (const target of visibilityTargets) {
      this.handleVisibilityChanges(target, mediaToRecheck);
    }
    for (const video of mediaToRecheck) {
      this.recheckVideoElement(video);
    }
  }

  /**
   * Process child list mutations (added/removed nodes)
   * @param {MutationRecord} mutation - Mutation record
   * @private
   */
  processChildListMutation(mutation: MutationRecord): void {
    // Handle added nodes
    mutation.addedNodes.forEach((node) => {
      // Only process element nodes (nodeType 1)
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      if (node === document.documentElement) {
        // Document was replaced (e.g., watch.sling.com uses document.write)
        window.VSC.logger.debug('Document was replaced, reinitializing');
        this.onDocumentReplaced();
        return;
      }

      this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, true);
    });

    // Handle removed nodes
    mutation.removedNodes.forEach((node) => {
      // Only process element nodes (nodeType 1)
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      this.checkForVideoAndShadowRoot(node, node.parentNode || mutation.target, false);
    });
  }

  /**
   * Process attribute mutations
   * @param {MutationRecord} mutation - Mutation record
   * @private
   */
  processAttributeMutation(
    mutation: MutationRecord,
    visibilityTargets?: Set<Element>,
    mediaToRecheck?: Set<HTMLMediaElement>
  ): void {
    const target = mutation.target as Element;
    // Handle style and class changes that might affect video visibility
    if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
      if (visibilityTargets && mediaToRecheck) {
        if (
          target.tagName === 'VIDEO' ||
          (target.tagName === 'AUDIO' && this.config.settings.audioBoolean)
        ) {
          mediaToRecheck.add(target as HTMLMediaElement);
        } else {
          visibilityTargets.add(target);
        }
      } else {
        this.handleVisibilityChanges(target);
      }
    }

    // Handle special cases like Apple TV+ player
    if (
      target.getAttribute('aria-hidden') === 'false' ||
      target.nodeName === 'APPLE-TV-PLUS-PLAYER'
    ) {
      const flattenedNodes = window.VSC.DomUtils.getShadow(document.body) as Element[];
      const videoNodes = flattenedNodes.filter((x: Element) => x.tagName === 'VIDEO');

      for (const node of videoNodes) {
        const media = node as HTMLMediaElement;
        // Only add vsc the first time for the apple-tv case
        if (media.vsc && target.nodeName === 'APPLE-TV-PLUS-PLAYER') {
          continue;
        }

        if (media.vsc) {
          media.vsc.remove();
        }

        this.checkForVideoAndShadowRoot(media, media.parentNode || target, true);
      }
    }
  }

  /**
   * Handle visibility changes on elements that might contain videos
   * @param {Element} element - Element that had style/class changes
   * @private
   */
  handleVisibilityChanges(element: Element, mediaToRecheck?: Set<HTMLMediaElement>): void {
    const recheck = (video: HTMLMediaElement): void => {
      if (mediaToRecheck) {
        mediaToRecheck.add(video);
      } else {
        this.recheckVideoElement(video);
      }
    };

    // If the element itself is a video
    if (
      element.tagName === 'VIDEO' ||
      (element.tagName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      recheck(element as HTMLMediaElement);
      return;
    }

    // Check if element contains videos
    const audioEnabled = this.config.settings.audioBoolean;
    const mediaTagSelector = audioEnabled ? 'video,audio' : 'video';
    const videos = element.querySelectorAll ? element.querySelectorAll(mediaTagSelector) : [];

    videos.forEach((video: Element) => {
      recheck(video as HTMLMediaElement);
    });
  }

  /**
   * Re-check if a video element should have a controller attached
   * @param {HTMLMediaElement} video - Video element to recheck
   * @private
   */
  recheckVideoElement(video: HTMLMediaElement): void {
    if (!this.mediaObserver) {
      return;
    }

    if (video.vsc) {
      // Video already has controller, check if it should be removed or just hidden
      if (!this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became invalid, removing controller');
        video.vsc.remove();
        delete video.vsc;
      } else {
        // Video is still valid, update visibility based on current state
        video.vsc.updateVisibility();
      }
    } else {
      // Video doesn't have controller, check if it should get one
      if (this.mediaObserver.isValidMediaElement(video)) {
        window.VSC.logger.debug('Video became valid, attaching controller');
        this.onVideoFound(video, video.parentElement || video.parentNode);
      }
    }
  }

  /**
   * Check if node is or contains video elements
   * @param {Node} node - Node to check
   * @param {Node} parent - Parent node
   * @param {boolean} added - True if node was added, false if removed
   * @private
   */
  checkForVideoAndShadowRoot(node: Node, parent: Node | null, added: boolean): void {
    // Only proceed with removal if node is missing from DOM
    if (!added && document.body?.contains(node)) {
      return;
    }

    if (
      node.nodeName === 'VIDEO' ||
      (node.nodeName === 'AUDIO' && this.config.settings.audioBoolean)
    ) {
      if (added) {
        this.onVideoFound(node as HTMLMediaElement, parent);
      } else {
        if ((node as HTMLMediaElement).vsc) {
          this.onVideoRemoved(node as HTMLMediaElement);
        }
      }
    } else {
      this.processNodeChildren(node, parent, added);
    }
  }

  /**
   * Process children of a node recursively
   * @param {Node} node - Node to process
   * @param {Node} parent - Parent node
   * @param {boolean} added - True if node was added
   * @private
   */
  processNodeChildren(node: Node, parent: Node | null, added: boolean): void {
    let children: Element[] = [];

    // Handle shadow DOM
    const element = node as Element;
    if (element.shadowRoot) {
      this.observeShadowRoot(element.shadowRoot);
      children = Array.from(element.shadowRoot.children);
    }

    // Handle regular children
    if (element.children) {
      children = [...children, ...Array.from(element.children)];
    }

    // Process all children
    for (const child of children) {
      this.checkForVideoAndShadowRoot(child, child.parentNode || parent, added);
    }
  }

  /**
   * Set up observer for shadow root
   * @param {ShadowRoot} shadowRoot - Shadow root to observe
   * @private
   */
  observeShadowRoot(shadowRoot: ShadowRoot): void {
    if (this.shadowObservers.has(shadowRoot)) {
      return; // Already observing
    }

    const shadowObserver = new MutationObserver((mutations: MutationRecord[]) => {
      this.scheduleMutationProcessing(mutations);
    });

    const observerOptions = {
      attributeFilter: ['aria-hidden', 'data-focus-method', 'style', 'class'],
      childList: true,
      subtree: true,
    };

    shadowObserver.observe(shadowRoot, observerOptions);
    this.shadowObservers.set(shadowRoot, shadowObserver);

    window.VSC.logger.debug('Shadow root observer added');
  }

  /**
   * Handle document replacement
   * @private
   */
  onDocumentReplaced(): void {
    // This callback should trigger reinitialization
    window.VSC.logger.warn('Document replacement detected - full reinitialization needed');
  }

  /**
   * Stop observing and clean up
   */
  stop(): void {
    this.active = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.pendingIdleCallback !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(this.pendingIdleCallback);
    }
    if (this.pendingTimeout !== null) {
      window.clearTimeout(this.pendingTimeout);
    }
    this.pendingIdleCallback = null;
    this.pendingTimeout = null;
    this.pendingProcessScheduled = false;
    this.pendingMutations = [];

    // Disconnect every shadow observer explicitly. A MutationObserver retains
    // its callback and observed root until disconnected, which otherwise leaks
    // the old controller lifecycle across teardown/reinit cycles.
    for (const shadowObserver of this.shadowObservers.values()) {
      shadowObserver.disconnect();
    }
    this.shadowObservers.clear();

    window.VSC.logger.debug('Video mutation observer stopped');
  }
}

// Create singleton instance
window.VSC.VideoMutationObserver = VideoMutationObserver;
export {};
