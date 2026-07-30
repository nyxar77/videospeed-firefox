/**
 * Shadow DOM creation and management
 */

import {
  getControllerThemeCSS,
  isControllerTheme,
  type ControllerTheme,
} from './controller-themes.ts';

interface ShadowDOMOptions {
  top?: string;
  left?: string;
  speed?: string;
  opacity?: number;
  buttonSize?: number;
  theme?: ControllerTheme;
}

interface ControllerPosition {
  top: string;
  left: string;
}

window.VSC = window.VSC || {};

class ShadowDOMManager {
  /**
   * Create shadow DOM for video controller
   * @param {HTMLElement} wrapper - Wrapper element
   * @param {Object} options - Configuration options
   * @returns {ShadowRoot} Created shadow root
   */
  static createShadowDOM(wrapper: HTMLElement, options: ShadowDOMOptions = {}): ShadowRoot {
    const {
      top = '0px',
      left = '0px',
      speed = '1.00',
      opacity = 0.3,
      buttonSize = 14,
      theme = 'default',
    } = options;

    const shadow = wrapper.attachShadow({ mode: 'open' });

    // Create style element with embedded CSS for immediate styling
    const document = wrapper.ownerDocument;
    const style = document.createElement('style');
    style.textContent = `
      * {
        line-height: 1.8em;
        font-family: sans-serif;
        font-size: 13px;
      }
      
      :host(:hover) #controls {
        display: inline-block;
      }
      
      /* Hide shadow DOM content for different hiding scenarios */
      :host(.vsc-hidden) #controller,
      :host(.vsc-nosource) #controller {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }

      /* YouTube autohide — fade with player controls.
         :host-context() matches when any ancestor of <vsc-controller> has the
         class, so no JS MutationObserver forwarding is needed. */
      :host-context(.ytp-autohide) #controller {
        visibility: hidden !important;
        opacity: 0 !important;
        transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Temporarily show controller (speed change flash, highest priority).
         vsc-manual:not(vsc-hidden) intentionally has NO CSS rule — user toggling
         back to "show" should restore default behavior (follow autohide), not
         permanently override it. vsc-manual is only read by JS flash guards. */

      /* Show shadow DOM content when host has vsc-show class (highest priority) */
      :host(.vsc-show) #controller {
        display: block !important;
        visibility: visible !important;
        opacity: ${opacity} !important;
      }
      
      #controller {
        position: absolute;
        top: 0;
        left: 0;
        background: black;
        color: white;
        border-radius: 6px;
        padding: 4px;
        margin: 10px 10px 10px 15px;
        cursor: default;
        z-index: 9999999;
        white-space: nowrap;
      }
      
      #controller:hover {
        opacity: 0.7;
      }
      
      #controller:hover>.draggable {
        margin-right: 0.8em;
      }
      
      #controls {
        display: none;
        vertical-align: middle;
      }
      
      #controller.dragging {
        cursor: -webkit-grabbing;
        opacity: 0.7;
      }
      
      #controller.dragging #controls {
        display: inline-block;
      }
      
      .draggable {
        cursor: -webkit-grab;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.8em;
        height: 1.4em;
        text-align: center;
        vertical-align: middle;
        box-sizing: border-box;
        touch-action: none;
      }
      
      .draggable:active {
        cursor: -webkit-grabbing;
      }
      
      button {
        opacity: 1;
        cursor: pointer;
        color: black;
        background: white;
        font-weight: normal;
        border-radius: 5px;
        padding: 1px 5px 3px 5px;
        font-size: inherit;
        line-height: inherit;
        border: 0px solid white;
        font-family: "Lucida Console", Monaco, monospace;
        margin: 0px 2px 2px 2px;
        transition: background 0.2s, color 0.2s;
      }
      
      button:focus {
        outline: 0;
      }
      
      button:hover {
        opacity: 1;
        background: #2196f3;
        color: #ffffff;
      }
      
      button:active {
        background: #2196f3;
        color: #ffffff;
        font-weight: bold;
      }
      
      button.rw {
        opacity: 0.65;
      }
    `;
    shadow.appendChild(style);
    this.setTheme(shadow, theme);

    // Create controller div
    const controller = document.createElement('div');
    controller.id = 'controller';
    controller.style.cssText = `top:${top}; left:${left}; opacity:${opacity};`;

    // Create draggable speed indicator
    const draggable = document.createElement('span');
    draggable.setAttribute('data-action', 'drag');
    draggable.className = 'draggable';
    draggable.style.cssText = `font-size: ${buttonSize}px;`;
    draggable.textContent = speed;
    controller.appendChild(draggable);

    // Create controls span
    const controls = document.createElement('span');
    controls.id = 'controls';
    controls.style.cssText = `font-size: ${buttonSize}px; line-height: ${buttonSize}px;`;

    // Create buttons
    const buttons: Array<{ action: string; text: string; className: string }> = [
      { action: 'rewind', text: '«', className: 'rw' },
      { action: 'slower', text: '−', className: '' },
      { action: 'faster', text: '+', className: '' },
      { action: 'advance', text: '»', className: 'rw' },
    ];

    buttons.forEach((btnConfig) => {
      const button = document.createElement('button');
      button.setAttribute('data-action', btnConfig.action);
      if (btnConfig.className) {
        button.className = btnConfig.className;
      }
      button.textContent = btnConfig.text;
      controls.appendChild(button);
    });

    controller.appendChild(controls);
    shadow.appendChild(controller);

    window.VSC.logger.debug('Shadow DOM created for video controller');
    return shadow;
  }

  /** Apply or replace the theme sheet in an existing controller shadow root. */
  static setTheme(shadow: ShadowRoot, theme: unknown): void {
    const resolvedTheme = isControllerTheme(theme) ? theme : 'default';
    let style = shadow.querySelector<HTMLStyleElement>('style[data-vsc-theme]');
    if (!style) {
      style = shadow.ownerDocument.createElement('style');
      style.dataset.vscTheme = '';
      shadow.appendChild(style);
    }
    style.textContent = getControllerThemeCSS(resolvedTheme);
  }

  /** Update controller dimensions without replacing its DOM or event handlers. */
  static setAppearance(
    shadow: ShadowRoot,
    options: { opacity?: unknown; buttonSize?: unknown }
  ): void {
    const controller = this.getController(shadow);
    if (typeof options.opacity === 'number' && Number.isFinite(options.opacity)) {
      controller.style.opacity = String(options.opacity);
    }

    if (typeof options.buttonSize === 'number' && Number.isFinite(options.buttonSize)) {
      const size = `${options.buttonSize}px`;
      this.getSpeedIndicator(shadow).style.fontSize = size;
      const controls = this.getControls(shadow);
      controls.style.fontSize = size;
      controls.style.lineHeight = size;
    }
  }

  /**
   * Get controller element from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Controller element
   */
  static getController(shadow: ShadowRoot): HTMLElement {
    return shadow.querySelector('#controller') as HTMLElement;
  }

  /**
   * Get controls container from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Controls element
   */
  static getControls(shadow: ShadowRoot): HTMLElement {
    return shadow.querySelector('#controls') as HTMLElement;
  }

  /**
   * Get draggable speed indicator from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {HTMLElement} Speed indicator element
   */
  static getSpeedIndicator(shadow: ShadowRoot): HTMLElement {
    return shadow.querySelector('.draggable') as HTMLElement;
  }

  /**
   * Get all buttons from shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @returns {NodeList} Button elements
   */
  static getButtons(shadow: ShadowRoot): NodeListOf<HTMLButtonElement> {
    return shadow.querySelectorAll('button');
  }

  /**
   * Update speed display in shadow DOM
   * @param {ShadowRoot} shadow - Shadow root
   * @param {number} speed - New speed value
   */
  static updateSpeedDisplay(shadow: ShadowRoot, speed: number): void {
    const speedIndicator = this.getSpeedIndicator(shadow);
    if (speedIndicator) {
      speedIndicator.textContent = window.VSC.Constants.formatSpeed(speed);
    }
  }

  /**
   * Calculate position for controller based on video element
   * @param {HTMLVideoElement} video - Video element
   * @returns {Object} Position object with top and left properties
   */
  static calculatePosition(video: HTMLMediaElement): ControllerPosition {
    const rect = video.getBoundingClientRect();

    // getBoundingClientRect is relative to the viewport; style coordinates
    // are relative to offsetParent, so we adjust for that here. offsetParent
    // can be null if the video has `display: none` or is not yet in the DOM.
    const offsetRect = video.offsetParent?.getBoundingClientRect();
    const top = `${Math.max(rect.top - (offsetRect?.top || 0), 0)}px`;
    const left = `${Math.max(rect.left - (offsetRect?.left || 0), 0)}px`;

    return { top, left };
  }

  /**
   * Calculate coordinates for a video relative to a specific containing block
   * @param {HTMLVideoElement} video - Video element
   * @param {HTMLElement|null} containingBlock - Controller's offset parent
   * @returns {Object} Position object with top and left properties
   */
  static calculatePositionRelativeTo(
    video: HTMLMediaElement,
    containingBlock: HTMLElement | null
  ): ControllerPosition {
    const rect = video.getBoundingClientRect();
    const containingRect = containingBlock?.getBoundingClientRect();
    const top = rect.top - (containingRect?.top || 0) + (containingBlock?.scrollTop || 0);
    const left = rect.left - (containingRect?.left || 0) + (containingBlock?.scrollLeft || 0);

    return { top: `${top}px`, left: `${left}px` };
  }
}

// Create singleton instance
window.VSC.ShadowDOMManager = ShadowDOMManager;
export {};
