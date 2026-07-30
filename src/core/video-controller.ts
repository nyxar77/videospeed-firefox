/**
 * Video Controller class for managing individual video elements
 *
 */

import type { Settings } from '../types/settings.ts';
import type { ControllerTheme } from '../ui/controller-themes.ts';

interface VideoControllerConfig {
  settings: Settings;
  getKeyBinding(action: string): number | undefined;
  save(settings: Partial<Settings>): Promise<boolean>;
}

interface VideoActionHandler {
  adjustSpeed(video: HTMLMediaElement, value: number, options?: Record<string, unknown>): void;
}

interface Positioning {
  insertionMethod: 'beforeParent' | 'afterParent' | 'firstChild';
  insertionPoint: HTMLElement;
}

interface ControllerElement extends HTMLElement {
  flashTimer?: ReturnType<typeof setTimeout>;
}

window.VSC = window.VSC || {};

class VideoController {
  video!: HTMLMediaElement;
  parent!: HTMLElement | null;
  config!: VideoControllerConfig;
  actionHandler!: VideoActionHandler;
  controlsManager!: { setupControlEvents(shadow: ShadowRoot, video: HTMLMediaElement): void };
  shouldStartHidden!: boolean;
  controllerId!: string;
  speedBeforeReset!: number | null;
  positionBeforeJump!: number | null;
  mark: number | null = null;
  div!: ControllerElement;
  speedIndicator!: HTMLElement;
  handlePlay?: EventListener;
  handleSeek?: EventListener;
  targetObserver?: MutationObserver;

  constructor(
    target: HTMLMediaElement,
    parent: HTMLElement | null,
    config: VideoControllerConfig,
    actionHandler: VideoActionHandler,
    shouldStartHidden = false
  ) {
    // Return existing controller if already attached
    if (target.vsc) {
      return target.vsc as unknown as VideoController;
    }

    this.video = target;
    this.parent = target.parentElement || parent;
    this.config = config;
    this.actionHandler = actionHandler;
    this.controlsManager = new window.VSC.ControlsManager(actionHandler, config);
    this.shouldStartHidden = shouldStartHidden;

    // Generate unique controller ID for badge tracking
    this.controllerId = this.generateControllerId(target);

    // Transient reset memory (not persisted, instance-specific)
    this.speedBeforeReset = null;
    this.positionBeforeJump = null;

    // Attach controller to video element first (needed for adjustSpeed)
    target.vsc = this;

    // Register with state manager immediately after controller is attached
    if (window.VSC.stateManager) {
      window.VSC.stateManager.registerController(this);
    } else {
      window.VSC.logger.error('StateManager not available during VideoController initialization');
    }

    // Initialize speed
    this.initializeSpeed();

    // Create UI
    this.div = this.initializeControls();

    // Set up event handlers
    this.setupEventHandlers();

    // Set up mutation observer for src changes
    this.setupMutationObserver();

    window.VSC.logger.info('VideoController initialized for video element');
  }

  /**
   * Initialize video speed based on settings.
   *
   * Uses source:'init' so setSpeed skips the lastSpeed update — during init
   * we don't want to arm fight-back with a stale/default value that could
   * conflict with the player's own initialization sequence.
   * @private
   */
  initializeSpeed(): void {
    const targetSpeed = this.getTargetSpeed();

    window.VSC.logger.debug(`Setting initial playbackRate to: ${targetSpeed}`);

    if (!this.actionHandler || targetSpeed === this.video.playbackRate) {
      return;
    }

    // Defer until metadata is loaded — setting playbackRate before the player
    // has initialized can race with the site's own init sequence.
    if (this.video.readyState < 1) {
      window.VSC.logger.debug('Deferring initializeSpeed until loadedmetadata');
      const handler = (): void => {
        this.video.removeEventListener('loadedmetadata', handler);
        if (targetSpeed !== this.video.playbackRate) {
          this.actionHandler.adjustSpeed(this.video, targetSpeed, { source: 'init' });
        }
      };
      this.video.addEventListener('loadedmetadata', handler);
    } else {
      this.actionHandler.adjustSpeed(this.video, targetSpeed, { source: 'init' });
    }
  }

  /**
   * Get target speed for video initialization and event restoration.
   *
   * lastSpeed semantics: null = "no user choice this session", any number
   * (including 1.0) = "user deliberately set this." setSpeed() writes a
   * real number on every user action; load() initializes to null when a
   * per-site rule exists or rememberSpeed is off.
   *
   * Fresh load priority:
   *   1. siteDefaultSpeed (per-site rule) — always wins if configured
   *   2. lastSpeed from storage (rememberSpeed=true, no per-site rule)
   *   3. 1.0 fallback
   * Mid-session: user's last setSpeed() call wins until next page load.
   *
   * @returns {number} Target speed
   * @private
   */
  getTargetSpeed(_eventTarget?: EventTarget | null): number {
    const baseline = this.config.settings.siteDefaultSpeed ?? 1.0;
    const last = this.config.settings.lastSpeed;

    if (last !== null) {
      window.VSC.logger.debug(`Using lastSpeed ${last} (baseline=${baseline})`);
      return last;
    }

    window.VSC.logger.debug(`Using baseline ${baseline} (lastSpeed=${last})`);
    return baseline;
  }

  /**
   * Initialize video controller UI
   * @returns {HTMLElement} Controller wrapper element
   * @private
   */
  initializeControls(): ControllerElement {
    window.VSC.logger.debug('initializeControls Begin');

    const document = this.video.ownerDocument;
    const speed = window.VSC.Constants.formatSpeed(this.video.playbackRate);

    window.VSC.logger.debug(`Speed variable set to: ${speed}`);

    // Create custom element wrapper to avoid CSS conflicts
    const wrapper = document.createElement('vsc-controller') as ControllerElement;

    // Apply all CSS classes at once to prevent race condition flash
    const cssClasses = ['vsc-controller'];

    // Only hide controller if video has no source AND is not ready/functional
    // This prevents hiding controllers for live streams or dynamically loaded videos
    if (!this.video.currentSrc && !this.video.src && this.video.readyState < 2) {
      cssClasses.push('vsc-nosource');
    }

    if (this.config.settings.startHidden || this.shouldStartHidden) {
      cssClasses.push('vsc-hidden');
      window.VSC.logger.debug('Starting controller hidden');
    }
    // When startHidden=false, use natural visibility (no special class needed)

    // Apply all classes at once to prevent visible flash
    wrapper.className = cssClasses.join(' ');

    // Keep position controlled by inject.css so site-specific relative overrides
    // continue to work. Generic absolute controllers are anchored after insertion.
    wrapper.style.cssText = 'z-index: 9999999 !important;';

    // Create shadow DOM with placeholder position (set after insertion)
    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, {
      top: '0px',
      left: '0px',
      speed: speed,
      opacity: this.config.settings.controllerOpacity,
      buttonSize: this.config.settings.controllerButtonSize,
      theme: this.config.settings.controllerTheme,
    });

    // Set up control events
    this.controlsManager.setupControlEvents(shadow, this.video);

    // Store speed indicator reference
    this.speedIndicator = window.VSC.ShadowDOMManager.getSpeedIndicator(shadow);

    // Insert into DOM FIRST — position calculation needs the wrapper in the DOM
    this.insertIntoDOM(document, wrapper);

    // THEN compute position based on actual DOM state.
    // If a CSS override sets the wrapper to position:relative (e.g. YouTube, Netflix),
    // the inner controller stays at (0,0) and the CSS nudge handles placement.
    // Otherwise (wrapper is absolute), anchor the wrapper itself to the video.
    // The wrapper's offset parent is the containing block that its top/left use;
    // using the video's offset parent here can place the controller outside the
    // video on pages with nested or unusual layout containers.
    const computedPosition = getComputedStyle(wrapper).position;
    if (computedPosition !== 'relative') {
      const position = window.VSC.ShadowDOMManager.calculatePositionRelativeTo(
        this.video,
        (wrapper.offsetParent || this.video.offsetParent) as HTMLElement | null
      );
      wrapper.style.top = position.top;
      wrapper.style.left = position.left;
      const innerController = window.VSC.ShadowDOMManager.getController(shadow);
      innerController.style.top = '0px';
      innerController.style.left = '0px';
    }

    window.VSC.logger.debug('initializeControls End');
    return wrapper;
  }

  /** Update the controller palette without recreating its DOM or handlers. */
  setTheme(theme: ControllerTheme): void {
    if (this.div.shadowRoot) {
      window.VSC.ShadowDOMManager.setTheme(this.div.shadowRoot, theme);
    }
  }

  /**
   * Insert controller into DOM with site-specific positioning
   * @param {Document} document - Document object
   * @param {HTMLElement} wrapper - Wrapper element to insert
   * @private
   */
  insertIntoDOM(document: Document, wrapper: ControllerElement): void {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(wrapper);

    // Get site-specific positioning information
    const positioning = window.VSC.siteHandlerManager.getControllerPosition(
      this.parent,
      this.video
    ) as Positioning;

    switch (positioning.insertionMethod) {
      case 'beforeParent':
        positioning.insertionPoint.parentElement?.insertBefore(
          fragment,
          positioning.insertionPoint
        );
        break;

      case 'afterParent':
        positioning.insertionPoint.parentElement?.insertBefore(
          fragment,
          positioning.insertionPoint.nextSibling
        );
        break;

      case 'firstChild':
      default:
        positioning.insertionPoint.insertBefore(fragment, positioning.insertionPoint.firstChild);
        break;
    }

    window.VSC.logger.debug(`Controller inserted using ${positioning.insertionMethod} method`);
  }

  /**
   * Set up event handlers for media events
   * @private
   */
  setupEventHandlers() {
    const mediaEventAction = (event: Event): void => {
      const media = event.target as HTMLMediaElement;
      const targetSpeed = this.getTargetSpeed(media);

      // Lifecycle restore, not a user choice — don't persist to lastSpeed.
      window.VSC.logger.info(`Media event ${event.type}: restoring speed to ${targetSpeed}`);
      this.actionHandler.adjustSpeed(media, targetSpeed, { source: 'init' });
    };

    // Bind event handlers
    this.handlePlay = mediaEventAction.bind(this);
    // Don't restore speed on seeked if the video hasn't loaded data yet —
    // the player may still be initializing.
    this.handleSeek = (event: Event): void => {
      const media = event.target as HTMLMediaElement;
      if (media.readyState < 2) {
        return;
      }
      mediaEventAction(event);
    };

    // Add essential event listeners for speed restoration
    this.video.addEventListener('play', this.handlePlay);
    this.video.addEventListener('seeked', this.handleSeek);

    window.VSC.logger.debug('Added essential media event handlers: play, seeked');
  }

  /**
   * Set up mutation observer for src attribute changes
   * @private
   */
  setupMutationObserver(): void {
    this.targetObserver = new MutationObserver((mutations: MutationRecord[]) => {
      mutations.forEach((mutation: MutationRecord) => {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'src' || mutation.attributeName === 'currentSrc')
        ) {
          window.VSC.logger.debug('Mutation of A/V element detected');
          const controller = this.div;
          const media = mutation.target as HTMLMediaElement;
          if (!media.src && !media.currentSrc) {
            controller.classList.add('vsc-nosource');
          } else {
            controller.classList.remove('vsc-nosource');
          }
        }
      });
    });

    this.targetObserver.observe(this.video, {
      attributeFilter: ['src', 'currentSrc'],
    });
  }

  /**
   * Remove controller and clean up
   */
  remove(): void {
    window.VSC.logger.debug('Removing VideoController');

    // Remove DOM element
    if (this.div && this.div.parentNode) {
      this.div.remove();
    }

    // Remove event listeners
    if (this.handlePlay) {
      this.video.removeEventListener('play', this.handlePlay);
    }
    if (this.handleSeek) {
      this.video.removeEventListener('seeked', this.handleSeek);
    }

    // Disconnect mutation observer
    if (this.targetObserver) {
      this.targetObserver.disconnect();
    }

    // Remove from state manager
    if (window.VSC.stateManager) {
      window.VSC.stateManager.removeController(this.controllerId);
    }

    // Remove reference from video element
    delete this.video.vsc;

    window.VSC.logger.debug('VideoController removed successfully');
  }

  /**
   * Generate unique controller ID for badge tracking
   * @param {HTMLElement} target - Video/audio element
   * @returns {string} Unique controller ID
   * @private
   */
  generateControllerId(target: HTMLMediaElement): string {
    const timestamp = Date.now();
    const src = target.currentSrc || target.src || 'no-src';
    const tagName = target.tagName.toLowerCase();

    // Create a simple hash from src for uniqueness
    const srcHash = src.split('').reduce((hash, char) => {
      hash = (hash << 5) - hash + char.charCodeAt(0);
      return hash & hash; // Convert to 32-bit integer
    }, 0);

    const random = Math.floor(Math.random() * 1000);
    return `${tagName}-${Math.abs(srcHash)}-${timestamp}-${random}`;
  }

  /**
   * Check if the video element is currently visible
   * @returns {boolean} True if video is visible
   */
  isVideoVisible(): boolean {
    // Check if video is still connected to DOM
    if (!this.video.isConnected) {
      return false;
    }

    // Check computed style for visibility
    const style = window.getComputedStyle(this.video);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Check if video has reasonable dimensions
    const rect = this.video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  }

  /**
   * Update controller visibility based on video visibility
   * Called when video visibility changes
   */
  updateVisibility(): void {
    const isVisible = this.isVideoVisible();
    const isCurrentlyHidden = this.div.classList.contains('vsc-hidden');

    // Special handling for audio elements - don't hide controllers for functional audio
    if (this.video.tagName === 'AUDIO') {
      // For audio, only hide if manually hidden or if audio support is disabled
      if (!this.config.settings.audioBoolean && !isCurrentlyHidden) {
        this.div.classList.add('vsc-hidden');
        window.VSC.logger.debug('Hiding audio controller - audio support disabled');
      } else if (
        this.config.settings.audioBoolean &&
        isCurrentlyHidden &&
        !this.div.classList.contains('vsc-manual')
      ) {
        // Show audio controller if audio support is enabled and not manually hidden
        this.div.classList.remove('vsc-hidden');
        window.VSC.logger.debug('Showing audio controller - audio support enabled');
      }
      return;
    }

    // Original logic for video elements
    if (
      isVisible &&
      isCurrentlyHidden &&
      !this.div.classList.contains('vsc-manual') &&
      !this.config.settings.startHidden
    ) {
      // Video became visible and controller is hidden (but not manually hidden and not set to start hidden)
      this.div.classList.remove('vsc-hidden');
      window.VSC.logger.debug('Showing controller - video became visible');
    } else if (!isVisible && !isCurrentlyHidden) {
      // Video became invisible and controller is visible
      this.div.classList.add('vsc-hidden');
      window.VSC.logger.debug('Hiding controller - video became invisible');
    }
  }
}

// Create singleton instance
window.VSC.VideoController = VideoController;

// Global variables available for both browser and testing
