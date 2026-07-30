/**
 * DOM utility functions for Video Speed Controller
 */

window.VSC = window.VSC || {};
window.VSC.DomUtils = {};

function isMediaElement(element: Element): element is HTMLMediaElement {
  return element.tagName === 'VIDEO' || element.tagName === 'AUDIO';
}

/**
 * Check if we're running in an iframe
 * @returns {boolean} True if in iframe
 */
window.VSC.DomUtils.inIframe = function (): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * Get all elements in shadow DOMs recursively
 * @param {Element} parent - Parent element to search
 * @param {number} maxDepth - Maximum recursion depth to prevent infinite loops
 * @returns {Array<Element>} Flattened array of all elements
 */
window.VSC.DomUtils.getShadow = function (parent: Element | ShadowRoot, maxDepth = 10): Element[] {
  const result: Element[] = [];
  const visited = new WeakSet(); // Prevent infinite loops

  function getChild(element: Element, depth = 0): void {
    // Prevent infinite recursion and excessive depth
    if (depth > maxDepth || visited.has(element)) {
      return;
    }

    visited.add(element);

    let child = element.firstElementChild;
    while (child) {
      result.push(child);
      getChild(child, depth + 1);

      // Only traverse shadow roots if we haven't exceeded depth limit
      if (child.shadowRoot && depth < maxDepth - 2) {
        // Always handle shadow roots synchronously to maintain function contract
        result.push(...window.VSC.DomUtils.getShadow(child.shadowRoot, maxDepth - depth));
      }

      child = child.nextElementSibling;
    }
  }

  getChild(parent as Element);
  return result.flat(Infinity);
};

/**
 * Find nearest parent of same size as video parent
 * @param {Element} element - Starting element
 * @returns {Element} Parent element
 */
window.VSC.DomUtils.findVideoParent = function (element: Element): Element | null {
  let parentElement = element.parentElement as HTMLElement | null;

  while (
    parentElement?.parentElement &&
    parentElement.parentElement.offsetHeight === parentElement.offsetHeight &&
    parentElement.parentElement.offsetWidth === parentElement.offsetWidth
  ) {
    parentElement = parentElement.parentElement;
  }

  return parentElement;
};

/**
 * Initialize document when DOM is ready
 * @param {Document} document - Document to initialize
 * @param {Function} callback - Callback to run when ready
 */
window.VSC.DomUtils.initializeWhenReady = function (
  document: Document | null | undefined,
  callback: (document: Document) => void
): void {
  window.VSC.logger.debug('Begin initializeWhenReady');

  if (document) {
    if (document.readyState !== 'loading') {
      callback(document);
    } else {
      document.addEventListener('DOMContentLoaded', () => callback(document), { once: true });
    }
  }

  window.VSC.logger.debug('End initializeWhenReady');
};

/**
 * Check if element or its children are video/audio elements
 * Recursively searches through nested shadow DOM structures
 * @param {Element} node - Node to check
 * @param {boolean} audioEnabled - Whether to check for audio elements
 * @returns {Array<Element>} Array of media elements found
 */
window.VSC.DomUtils.findMediaElements = function (
  node: Element | Document | ShadowRoot | null,
  audioEnabled = false
): HTMLMediaElement[] {
  if (!node) {
    return [];
  }

  const mediaElements: HTMLMediaElement[] = [];
  const selector = audioEnabled ? 'video,audio' : 'video';

  // Check the node itself
  if (node instanceof Element && node.matches(selector) && isMediaElement(node)) {
    mediaElements.push(node);
  }

  // Check children
  if (node.querySelectorAll) {
    mediaElements.push(...Array.from(node.querySelectorAll(selector)).filter(isMediaElement));
  }

  // Recursively check shadow roots
  if (node instanceof Element && node.shadowRoot) {
    mediaElements.push(...window.VSC.DomUtils.findShadowMedia(node.shadowRoot, selector));
  }

  return mediaElements;
};

/**
 * Recursively find media elements in shadow DOM trees
 * @param {ShadowRoot|Document|Element} root - Root to search from
 * @param {string} selector - CSS selector for media elements
 * @returns {Array<Element>} Array of media elements found
 */
window.VSC.DomUtils.findShadowMedia = function (
  root: Element | Document | ShadowRoot,
  selector: string
): HTMLMediaElement[] {
  const results: HTMLMediaElement[] = [];

  // If root is an element with shadowRoot, search in its shadow first
  if (root instanceof Element && root.shadowRoot) {
    results.push(...window.VSC.DomUtils.findShadowMedia(root.shadowRoot, selector));
  }

  // Add any matching elements in current root (if it's a shadowRoot/document)
  if (root.querySelectorAll) {
    results.push(...Array.from(root.querySelectorAll(selector)).filter(isMediaElement));
  }

  // Recursively check all elements with shadow roots
  if (root.querySelectorAll) {
    const allElements = Array.from(root.querySelectorAll('*'));
    allElements.forEach((element) => {
      if (element.shadowRoot) {
        results.push(...window.VSC.DomUtils.findShadowMedia(element.shadowRoot, selector));
      }
    });
  }

  return results;
};

// Global variables available for both browser and testing
export {};
