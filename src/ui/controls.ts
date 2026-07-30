/**
 * Control button interactions and event handling
 */

import type { Settings } from '../types/settings.ts';

interface ControlsConfig {
  settings: Settings;
  getKeyBinding(action: string): number | undefined;
}

interface ControlsActionHandler {
  runAction(action: string, value: number | false | undefined, event?: Event): void;
  adjustSpeed(video: HTMLMediaElement, value: number, options?: Record<string, unknown>): void;
}

window.VSC = window.VSC || {};

class ControlsManager {
  actionHandler: ControlsActionHandler;
  config: ControlsConfig;

  constructor(actionHandler: ControlsActionHandler, config: ControlsConfig) {
    this.actionHandler = actionHandler;
    this.config = config;
  }

  /**
   * Set up control button event listeners
   * @param {ShadowRoot} shadow - Shadow root containing controls
   * @param {HTMLVideoElement} video - Associated video element
   */
  setupControlEvents(shadow: ShadowRoot, video: HTMLMediaElement): void {
    this.setupDragHandler(shadow);
    this.setupButtonHandlers(shadow);
    this.setupWheelHandler(shadow, video);
    this.setupClickPrevention(shadow);
  }

  /**
   * Set up drag and double-click-to-reset handlers for speed indicator
   * Uses pointer events for unified mouse + touch support
   * @param {ShadowRoot} shadow - Shadow root
   * @private
   */
  setupDragHandler(shadow: ShadowRoot): void {
    const draggable = shadow.querySelector('.draggable') as HTMLElement;

    // Pointer-based drag (unified mouse + touch)
    draggable.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        const target = e.target as HTMLElement;
        this.actionHandler.runAction(target.dataset['action'] ?? 'drag', false, e);
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );

    // Double-click / double-tap to reset speed
    draggable.addEventListener(
      'dblclick',
      (e: MouseEvent) => {
        const resetTarget = this.config.getKeyBinding('reset') || 1.0;
        this.actionHandler.runAction('reset', resetTarget, e);
        e.stopPropagation();
        e.preventDefault();
      },
      true
    );
  }

  /**
   * Set up button click handlers
   * @param {ShadowRoot} shadow - Shadow root
   * @private
   */
  setupButtonHandlers(shadow: ShadowRoot): void {
    shadow.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      // Click handler
      button.addEventListener(
        'click',
        (e: MouseEvent) => {
          const target = e.currentTarget as HTMLButtonElement;
          this.actionHandler.runAction(
            target.dataset['action'] ?? '',
            this.config.getKeyBinding(target.dataset['action'] ?? ''),
            e
          );
          e.stopPropagation();
        },
        true
      );

      // Touch handler to prevent conflicts
      button.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          e.stopPropagation();
        },
        true
      );
    });
  }

  /**
   * Set up mouse wheel handler for speed control with touchpad filtering
   *
   * Cross-browser wheel event behavior:
   * - Chrome/Safari/Edge: ALL devices use DOM_DELTA_PIXEL (mouse wheels ~100px, touchpads ~1-15px)
   * - Firefox: Mouse wheels use DOM_DELTA_LINE, touchpads use DOM_DELTA_PIXEL
   *
   * Detection strategy: Use magnitude threshold in DOM_DELTA_PIXEL mode to distinguish
   * mouse wheels (±100px typical) from touchpads (±1-15px typical). Threshold of 50px
   * provides safety margin based on empirical browser testing.
   *
   * @param {ShadowRoot} shadow - Shadow root
   * @param {HTMLVideoElement} video - Video element
   * @private
   */
  setupWheelHandler(shadow: ShadowRoot, video: HTMLMediaElement): void {
    const controller = shadow.querySelector('#controller') as HTMLElement;

    // Hover dwell gate: only allow wheel events after the cursor has rested on the
    // controller for HOVER_DWELL_MS. This prevents accidental speed changes when
    // scrolling through feed-based sites (Twitter, Reddit) where the cursor briefly
    // passes over the controller. See #1352.
    const HOVER_DWELL_MS = 300;
    let hoverStart = 0;

    controller.addEventListener('mouseenter', (e: MouseEvent) => {
      hoverStart = e.timeStamp;
    });

    controller.addEventListener('mouseleave', () => {
      hoverStart = 0;
    });

    controller.addEventListener(
      'wheel',
      (event: WheelEvent) => {
        // Reject wheel events before hover dwell threshold is met
        if (event.timeStamp - hoverStart < HOVER_DWELL_MS) {
          window.VSC.logger.debug('Wheel ignored: hover dwell threshold not met');
          return;
        }

        // Detect and filter touchpad events to prevent interference during page scrolling
        if (event.deltaMode === event.DOM_DELTA_PIXEL) {
          // Chrome/Safari/Edge: Use magnitude to distinguish mouse wheel (>50px) from touchpad (<50px)
          const TOUCHPAD_THRESHOLD = 50;
          if (Math.abs(event.deltaY) < TOUCHPAD_THRESHOLD) {
            window.VSC.logger.debug(
              `Touchpad scroll detected (deltaY: ${event.deltaY}) - ignoring`
            );
            return;
          }
        }
        // Firefox: DOM_DELTA_LINE events are typically legitimate mouse wheels, allow them

        event.preventDefault();

        const delta = Math.sign(event.deltaY);
        const step = 0.1;
        const speedDelta = delta < 0 ? step : -step;

        this.actionHandler.adjustSpeed(video, speedDelta, { relative: true });

        window.VSC.logger.debug(
          `Wheel control: adjusting speed by ${speedDelta} (deltaMode: ${event.deltaMode}, deltaY: ${event.deltaY})`
        );
      },
      { passive: false }
    );
  }

  /**
   * Set up click prevention for controller container
   * @param {ShadowRoot} shadow - Shadow root
   * @private
   */
  setupClickPrevention(shadow: ShadowRoot): void {
    const controller = shadow.querySelector('#controller') as HTMLElement;

    // Prevent clicks from bubbling up to page
    controller.addEventListener('click', (e) => e.stopPropagation(), false);
    controller.addEventListener('mousedown', (e) => e.stopPropagation(), false);
  }
}

// Create singleton instance
window.VSC.ControlsManager = ControlsManager;
