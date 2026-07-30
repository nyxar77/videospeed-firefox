/**
 * Video Speed Controller — Main Content Script
 */

import type { Settings } from '../types/settings.ts';

interface ConfigLike {
  settings: Settings;
  load(): Promise<Settings | undefined>;
}

interface ActionHandlerLike {
  adjustSpeed(video: HTMLMediaElement, value: number, options?: Record<string, unknown>): void;
  resetSpeed(video: HTMLMediaElement, target: number): void;
  runAction(action: string, value: number | null, event?: Event): void;
}

interface EventManagerLike {
  actionHandler: ActionHandlerLike | null;
  setupEventListeners(document: Document): void;
  cleanup(): void;
}

interface MediaObserverLike {
  scanForMediaLight(document: Document): HTMLMediaElement[];
  scanAll(document: Document): HTMLMediaElement[];
  isValidMediaElement(video: HTMLMediaElement): boolean;
  shouldStartHidden(video: HTMLMediaElement): boolean;
}

interface MutationObserverLike {
  start(document: Document): void;
  stop(): void;
}

interface SiteHandlerManagerLike {
  initialize(document: Document): void;
  shouldIgnoreVideo(video: HTMLMediaElement): boolean;
  handleSpeedChange(video: HTMLMediaElement, speed: number): void;
  cleanup(): void;
}

interface CssStorageChangeEvent extends CustomEvent {
  detail: { customCSS?: { newValue?: string } };
}

interface VscMessage {
  type: string;
  payload?: { speed?: number; delta?: number };
}

// The isolated bridge normally supplies settings in a few milliseconds. Do
// not let a cold or stalled Firefox storage backend block the page runtime.
const STARTUP_SETTINGS_DEADLINE_MS = 200;

class VideoSpeedExtension {
  config: ConfigLike | null = null;
  actionHandler: ActionHandlerLike | null = null;
  eventManager: EventManagerLike | null = null;
  mutationObserver: MutationObserverLike | null = null;
  mediaObserver: MediaObserverLike | null = null;
  initialized = false;
  _lifecycleId = 0;
  _pendingTimeouts = new Set<number>();
  _pendingIdleCallbacks = new Set<number>();
  _cssStorageChangeHandler: EventListener | null = null;
  _controllerSheet: CSSStyleSheet | null = null;
  _customSheet: CSSStyleSheet | null = null;
  VideoController!: new (
    video: HTMLMediaElement,
    parent: HTMLElement | null,
    config: ConfigLike,
    actionHandler: ActionHandlerLike,
    shouldStartHidden: boolean
  ) => VSCControllerState;
  ActionHandler!: new (config: ConfigLike, eventManager: EventManagerLike) => ActionHandlerLike;
  EventManager!: new (
    config: ConfigLike,
    actionHandler: ActionHandlerLike | null
  ) => EventManagerLike;
  logger!: VSCNamespace['logger'];
  initializeWhenReady!: (document: Document, callback: (document: Document) => void) => void;
  siteHandlerManager!: SiteHandlerManagerLike;
  VideoMutationObserver!: new (
    config: ConfigLike,
    onVideoFound: (video: HTMLMediaElement, parent: Node | null) => void,
    onVideoRemoved: (video: HTMLMediaElement) => void,
    mediaObserver: MediaObserverLike
  ) => MutationObserverLike;
  MediaElementObserver!: new (
    config: ConfigLike,
    siteHandler: SiteHandlerManagerLike
  ) => MediaObserverLike;
  MESSAGE_TYPES!: Record<string, string>;

  /**
   * Run deferred work only while the current extension lifecycle is active.
   * Page teardown can happen before an async initialization callback fires.
   *
   * @param {Function} callback - Deferred work to run
   * @param {number} delay - Fallback timeout when idle callbacks are unavailable
   */
  scheduleDeferredWork(callback: () => void, delay = 0): void {
    const lifecycleId = this._lifecycleId;
    // Delayed work uses a timer so the delay remains meaningful. Idle callbacks
    // are reserved for optional work that explicitly requests a zero delay.
    const useIdleCallback = delay === 0 && typeof window.requestIdleCallback === 'function';
    let handleId: number;

    const run = () => {
      if (useIdleCallback) {
        this._pendingIdleCallbacks.delete(handleId);
      } else {
        this._pendingTimeouts.delete(handleId);
      }

      if (lifecycleId !== this._lifecycleId) {
        return;
      }

      callback();
    };

    if (useIdleCallback) {
      handleId = window.requestIdleCallback(run);
      this._pendingIdleCallbacks.add(handleId);
    } else {
      handleId = window.setTimeout(run, delay);
      this._pendingTimeouts.add(handleId);
    }
  }

  /** Cancel deferred work from a previous lifecycle. */
  cancelDeferredWork(): void {
    for (const timeoutId of this._pendingTimeouts) {
      window.clearTimeout(timeoutId);
    }
    for (const idleId of this._pendingIdleCallbacks) {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    }

    this._pendingTimeouts.clear();
    this._pendingIdleCallbacks.clear();
  }

  /**
   * Initialize the extension
   */
  async initialize(): Promise<void> {
    const lifecycleId = ++this._lifecycleId;

    try {
      // Access global modules
      this.VideoController = window.VSC.VideoController;
      this.ActionHandler = window.VSC.ActionHandler;
      this.EventManager = window.VSC.EventManager;
      this.logger = window.VSC.logger;
      this.initializeWhenReady = window.VSC.DomUtils.initializeWhenReady;
      this.siteHandlerManager = window.VSC.siteHandlerManager;
      this.VideoMutationObserver = window.VSC.VideoMutationObserver;
      this.MediaElementObserver = window.VSC.MediaElementObserver;
      this.MESSAGE_TYPES = window.VSC.Constants.MESSAGE_TYPES;

      this.logger.info('Video Speed Controller starting...');

      const config = window.VSC.videoSpeedConfig as ConfigLike;
      this.config = config;
      const settingsLoad = config.load();
      const settingsReady = await this.waitForStartupSettings(settingsLoad);

      if (lifecycleId !== this._lifecycleId) {
        return;
      }

      if (config.settings._abort) {
        this.logger.debug('Extension disabled on this site — aborting init');
        return;
      }

      this.applyInitialSpeed(document);

      // Begin DOM work as soon as the content script has the settings.
      this.deferDOMWork(document);

      if (!settingsReady) {
        this.logger.warn(
          'Settings load is delayed; starting controller with defaults until Firefox storage responds'
        );
        void settingsLoad.then(() => this.applyLateSettings(document, lifecycleId));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger?.error(`Failed to initialize Video Speed Controller: ${message}`);
      this.logger?.error(`Error stack: ${stack}`);
    }
  }

  /**
   * Wait briefly for persisted settings, then let the controller start with
   * the already-safe default configuration. Firefox can defer storage until
   * another extension surface (such as the popup) wakes its backend.
   */
  waitForStartupSettings(settingsLoad: Promise<Settings | undefined>): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          resolve(false);
        }
      }, STARTUP_SETTINGS_DEADLINE_MS);

      void settingsLoad.then(
        () => {
          settled = true;
          window.clearTimeout(timeout);
          resolve(true);
        },
        () => {
          settled = true;
          window.clearTimeout(timeout);
          resolve(true);
        }
      );
    });
  }

  /** Apply settings that arrived after the non-blocking startup deadline. */
  applyLateSettings(document: Document, lifecycleId: number): void {
    if (lifecycleId !== this._lifecycleId || !this.config) {
      return;
    }

    if (this.config.settings._abort) {
      this.teardown();
      return;
    }

    // Existing managers share the config object, so keyboard bindings and
    // speed rules update in place. Re-apply the initial speed for media that
    // became available while storage was delayed.
    this.applyInitialSpeed(document);
  }

  getInitialTargetSpeed(): number {
    if (!this.config) {
      return 1.0;
    }
    return this.config.settings.lastSpeed ?? this.config.settings.siteDefaultSpeed ?? 1.0;
  }

  applyInitialSpeed(document: Document): void {
    if (!this.config) {
      return;
    }
    const targetSpeed = Math.min(
      Math.max(this.getInitialTargetSpeed(), window.VSC.Constants.SPEED_LIMITS.MIN),
      window.VSC.Constants.SPEED_LIMITS.MAX
    );

    if (targetSpeed === 1.0) {
      return;
    }

    const selector = this.config.settings.audioBoolean ? 'video,audio' : 'video';
    const mediaElements = [...new Set(Array.from(document.querySelectorAll(selector)))];

    mediaElements.forEach((media: Element) => {
      const element = media as HTMLMediaElement;
      if (!element.isConnected || this.siteHandlerManager.shouldIgnoreVideo(element)) {
        return;
      }

      const applySpeed = (): void => {
        if (element.playbackRate !== targetSpeed) {
          this.siteHandlerManager.handleSpeedChange(element, targetSpeed);
        }
      };

      if (element.readyState < 1) {
        element.addEventListener('loadedmetadata', applySpeed, { once: true });
      } else {
        applySpeed();
      }
    });
  }

  /**
   * Initialize for a specific document
   * @param {Document} document - Document to initialize
   */
  initializeDocument(document: Document, lifecycleId = this._lifecycleId): void {
    try {
      if (lifecycleId !== this._lifecycleId) {
        return;
      }

      if (window.VSC.initialized) {
        return;
      }

      window.VSC.initialized = true;
      this.eventManager?.setupEventListeners(document);

      this.deferExpensiveOperations(document);
      this.logger.debug('Document initialization completed');
    } catch (error: unknown) {
      this.logger.error(
        `Failed to initialize document: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start observers and the first media scan as soon as the document is ready.
   * Only the comprehensive fallback scan is delayed.
   * @param {Document} document - Document to defer operations for
   */
  deferExpensiveOperations(document: Document): void {
    const callback = (): void => {
      try {
        // Start mutation observer — catches dynamically added media elements
        if (this.mutationObserver) {
          this.mutationObserver.start(document);
          this.logger.debug('Mutation observer started for document');
        }

        // Scan immediately so existing media gets a controller before the
        // browser's first useful interaction.
        this.deferredMediaScan(document);
      } catch (error: unknown) {
        this.logger.error(
          `Failed to complete deferred operations: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };

    callback();
  }

  /**
   * Perform the initial media scan
   * @param {Document} document - Document to scan
   */
  deferredMediaScan(document: Document): void {
    const mediaObserver = this.mediaObserver;
    if (!mediaObserver) {
      return;
    }
    // Split media scanning into smaller chunks to avoid blocking
    const performChunkedScan = (): void => {
      try {
        // Use a lighter initial scan - avoid expensive shadow DOM traversal initially
        const lightMedia = mediaObserver.scanForMediaLight(document);

        lightMedia.forEach((media) => {
          this.onVideoFound(media, media.parentElement || media.parentNode);
        });

        this.logger.info(
          `Attached controllers to ${lightMedia.length} media elements (light scan)`
        );

        // Schedule comprehensive scan for later if needed
        if (lightMedia.length === 0) {
          this.scheduleComprehensiveScan(document);
        }
      } catch (error: unknown) {
        this.logger.error(
          `Failed to scan media elements: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };

    performChunkedScan();
  }

  /**
   * Schedule a comprehensive scan if the light scan didn't find anything
   * @param {Document} document - Document to scan comprehensively
   */
  scheduleComprehensiveScan(document: Document): void {
    const mediaObserver = this.mediaObserver;
    if (!mediaObserver) {
      return;
    }
    // Only do comprehensive scan if we didn't find any media with light scan
    this.scheduleDeferredWork(() => {
      try {
        const comprehensiveMedia = mediaObserver.scanAll(document);

        comprehensiveMedia.forEach((media) => {
          // Skip if already has controller
          if (!media.vsc) {
            this.onVideoFound(media, media.parentElement || media.parentNode);
          }
        });

        this.logger.info(
          `Comprehensive scan found ${comprehensiveMedia.length} additional media elements`
        );
      } catch (error: unknown) {
        this.logger.error(
          `Failed comprehensive media scan: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }, 1000); // Wait 1 second before comprehensive scan
  }

  /**
   * Set up CSS, controllers, and observers immediately. The content script is
   * already isolated from the page's JavaScript, so waiting for idle time only
   * delays the controller without protecting the page from our DOM changes.
   */
  deferDOMWork(document: Document): void {
    const config = this.config;
    if (!config) {
      return;
    }
    const lifecycleId = this._lifecycleId;
    const doWork = (): void => {
      this.injectControllerCSS();
      this.setupCSSLiveUpdates();
      this.siteHandlerManager.initialize(document);

      this.eventManager = new this.EventManager(config, null);
      this.actionHandler = new this.ActionHandler(config, this.eventManager);
      this.eventManager.actionHandler = this.actionHandler;

      this.setupObservers();

      this.initializeWhenReady(document, (doc) => {
        if (lifecycleId === this._lifecycleId) {
          this.initializeDocument(doc, lifecycleId);
        }
      });

      this.logger.info('Video Speed Controller initialized successfully');
      this.initialized = true;
    };

    doWork();
  }

  /**
   * Resolve domain-based CSS selectors for the current hostname.
   * Matching domains: selector stripped (rule applies unconditionally).
   * Non-matching: entire rule removed. Stripping (vs neutering with a dead
   * selector) ensures perf-sensitive selectors like [style*=...] inside
   * non-matching rules never reach the browser's style invalidation engine.
   */
  preprocessDomainCSS(css: string): string {
    const hostname = location.hostname.replace(/^www\./, '');
    return css.replace(
      /:root\[style\*='--vsc-domain:\s*"([^"]+)"'\]([^{]*)\{([^}]*)\}/g,
      (_match: string, domain: string, selector: string, body: string) =>
        domain === hostname ? `${selector.trim()} {${body}}` : ''
    );
  }

  /**
   * Inject controller CSS via adoptedStyleSheets — pure CSSOM, zero DOM
   * mutations. <style> elements trigger page-level MutationObservers on
   * sites with complex frameworks, breaking their internal state.
   *
   * Two separate sheets: _controllerSheet (built-in defaults, domain-
   * preprocessed, never changes at runtime) and _customSheet (user
   * additions, injected raw, live-updatable). Keeps them separate so
   * user CSS edits don't re-preprocess the defaults.
   */
  injectControllerCSS(): void {
    try {
      if (!this.config) {
        return;
      }
      if (this._controllerSheet) {
        return;
      }
      this._controllerSheet = new CSSStyleSheet();
      this._controllerSheet.replaceSync(
        this.preprocessDomainCSS(window.VSC.Constants.DEFAULT_CONTROLLER_CSS)
      );
      const toAdopt = [this._controllerSheet];

      const customCSS = this.config.settings.customCSS || '';
      if (customCSS) {
        this._customSheet = new CSSStyleSheet();
        this._customSheet.replaceSync(customCSS);
        toAdopt.push(this._customSheet);
      }

      document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...toAdopt];
    } catch (error: unknown) {
      this.logger.error(
        `Failed to inject controller CSS: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Live-update the user's custom CSS when options are saved. */
  setupCSSLiveUpdates(): void {
    if (this._cssStorageChangeHandler) {
      document.documentElement.removeEventListener(
        'VSC_STORAGE_CHANGED',
        this._cssStorageChangeHandler
      );
    }

    this._cssStorageChangeHandler = (event: Event): void => {
      const e = event as CssStorageChangeEvent;
      if (e.detail?.customCSS?.newValue === undefined || !this._controllerSheet) {
        return;
      }
      const customCSS = e.detail.customCSS.newValue || '';
      if (customCSS) {
        if (!this._customSheet) {
          this._customSheet = new CSSStyleSheet();
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, this._customSheet];
        }
        this._customSheet.replaceSync(customCSS);
      } else if (this._customSheet) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (s) => s !== this._customSheet
        );
        this._customSheet = null;
      }
    };

    document.documentElement.addEventListener('VSC_STORAGE_CHANGED', this._cssStorageChangeHandler);
  }

  /**
   * Set up observers for DOM changes and video detection
   */
  setupObservers(): void {
    if (!this.config || !this.actionHandler) {
      return;
    }
    // Media element observer
    this.mediaObserver = new this.MediaElementObserver(this.config, this.siteHandlerManager);

    // Mutation observer for dynamic content
    this.mutationObserver = new this.VideoMutationObserver(
      this.config,
      (video, parent) => this.onVideoFound(video, parent),
      (video) => this.onVideoRemoved(video),
      this.mediaObserver
    );
  }

  /**
   * Handle newly found video element
   * @param {HTMLMediaElement} video - Video element
   * @param {HTMLElement} parent - Parent element
   */
  onVideoFound(video: HTMLMediaElement, parent: Node | null): void {
    try {
      const config = this.config;
      if (!config) {
        return;
      }
      if (this.mediaObserver && !this.mediaObserver.isValidMediaElement(video)) {
        this.logger.debug('Video element is not valid for controller attachment');
        return;
      }

      if (video.vsc) {
        this.logger.debug('Video already has controller attached');
        return;
      }

      // Defer until readyState >= HAVE_CURRENT_DATA — inserting a controller
      // too early can trigger the site's internal MutationObservers.
      if (video.readyState < 2) {
        this.logger.debug(
          'Deferring controller until loadeddata (readyState=%d)',
          video.readyState
        );
        video.addEventListener('loadeddata', () => this.onVideoFound(video, parent), {
          once: true,
        });
        return;
      }

      // Check if controller should start hidden based on video visibility/size
      const shouldStartHidden = this.mediaObserver
        ? this.mediaObserver.shouldStartHidden(video)
        : false;

      this.logger.debug(
        'Attaching controller to new video element',
        shouldStartHidden ? '(starting hidden)' : ''
      );
      video.vsc = new this.VideoController(
        video,
        parent as HTMLElement | null,
        config,
        this.actionHandler as ActionHandlerLike,
        shouldStartHidden
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to attach controller to video: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Tear down the extension: remove all controllers, stop observers, clean up listeners.
   * Counterpart to initialize() — leaves the page as if VSC was never active.
   */
  teardown(): void {
    this._lifecycleId++;
    this.cancelDeferredWork();

    if (!this.initialized) {
      return;
    }

    this.logger.info('Tearing down Video Speed Controller');

    // Remove all controllers from tracked media elements
    const videos = window.VSC.stateManager ? window.VSC.stateManager.getAllMediaElements() : [];
    for (const video of videos) {
      if (video.vsc) {
        video.vsc.remove();
      }
    }

    // Stop observing DOM for new videos
    if (this.mutationObserver) {
      this.mutationObserver.stop();
      this.mutationObserver = null;
    }

    // Remove keyboard/ratechange listeners
    if (this.eventManager) {
      this.eventManager.cleanup();
      this.eventManager = null;
    }

    // Clean up site-specific handlers
    if (this.siteHandlerManager) {
      this.siteHandlerManager.cleanup();
    }

    // Remove adopted controller CSS (both default and custom sheets)
    if (document.adoptedStyleSheets) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (s) => s !== this._controllerSheet && s !== this._customSheet
      );
    }
    if (this._cssStorageChangeHandler) {
      document.documentElement.removeEventListener(
        'VSC_STORAGE_CHANGED',
        this._cssStorageChangeHandler
      );
      this._cssStorageChangeHandler = null;
    }
    this._controllerSheet = null;
    this._customSheet = null;

    this.actionHandler = null;
    this.mediaObserver = null;
    this.initialized = false;
    window.VSC.initialized = false;
  }

  /**
   * Handle removed video element
   * @param {HTMLMediaElement} video - Video element
   */
  onVideoRemoved(video: HTMLMediaElement): void {
    try {
      if (video.vsc) {
        this.logger.debug('Removing controller from video element');
        video.vsc.remove();
      }
    } catch (error: unknown) {
      this.logger.error(
        `Failed to remove video controller: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

(function () {
  const extension = new VideoSpeedExtension();

  // Lifecycle commands from bridge (popup, background, storage changes)
  document.documentElement.addEventListener('VSC_MESSAGE', (event) => {
    const message = (event as CustomEvent<unknown>).detail as VscMessage | null;

    // Handle namespaced VSC message types
    if (
      message !== null &&
      typeof message === 'object' &&
      message.type &&
      message.type.startsWith('VSC_')
    ) {
      // Use state manager for complete media element discovery (includes shadow DOM)
      const videos = (
        window.VSC.stateManager ? window.VSC.stateManager.getAllMediaElements() : []
      ) as HTMLMediaElement[];

      switch (message.type) {
        case window.VSC.Constants.MESSAGE_TYPES.SET_SPEED:
          if (message.payload && typeof message.payload.speed === 'number') {
            const { MIN, MAX } = window.VSC.Constants.SPEED_LIMITS;
            const targetSpeed = Math.min(Math.max(message.payload.speed, MIN), MAX);
            videos.forEach((video: HTMLMediaElement) => {
              if (video.vsc) {
                extension.actionHandler?.adjustSpeed(video, targetSpeed);
              } else {
                video.playbackRate = targetSpeed;
              }
            });

            // Log the successful operation
            window.VSC.logger?.debug(
              `Set speed to ${targetSpeed} on ${videos.length} media elements`
            );
          }
          break;

        case window.VSC.Constants.MESSAGE_TYPES.ADJUST_SPEED:
          if (message.payload && typeof message.payload.delta === 'number') {
            const delta = message.payload.delta;
            videos.forEach((video: HTMLMediaElement) => {
              if (video.vsc) {
                extension.actionHandler?.adjustSpeed(video, delta, { relative: true });
              } else {
                // Fallback for videos without controller
                const { MIN: sMin, MAX: sMax } = window.VSC.Constants.SPEED_LIMITS;
                const newSpeed = Math.min(Math.max(video.playbackRate + delta, sMin), sMax);
                video.playbackRate = newSpeed;
              }
            });

            window.VSC.logger?.debug(
              `Adjusted speed by ${delta} on ${videos.length} media elements`
            );
          }
          break;

        case window.VSC.Constants.MESSAGE_TYPES.RESET_SPEED:
          videos.forEach((video: HTMLMediaElement) => {
            if (video.vsc) {
              extension.actionHandler?.resetSpeed(video, 1.0);
            } else {
              video.playbackRate = 1.0;
            }
          });

          window.VSC.logger?.debug(`Reset speed on ${videos.length} media elements`);
          break;

        case window.VSC.Constants.MESSAGE_TYPES.TOGGLE_DISPLAY:
          if (extension.actionHandler) {
            extension.actionHandler.runAction('display', null);
          }
          break;

        case window.VSC.Constants.MESSAGE_TYPES.TEARDOWN:
          extension.teardown();
          break;

        case window.VSC.Constants.MESSAGE_TYPES.REINIT:
          extension.initialize();
          break;
      }
    }
  });

  // Prevent double injection
  if (window.VSC_controller && window.VSC_controller.initialized) {
    window.VSC.logger?.info('VSC already initialized, skipping re-injection');
    return;
  }

  // Auto-initialize
  extension.initialize().catch((error) => {
    window.VSC.logger.error(`Extension initialization failed: ${error.message}`);
  });

  // Export only what's needed with consistent VSC_ prefix
  window.VSC_controller = extension; // The initialized instance
})();
