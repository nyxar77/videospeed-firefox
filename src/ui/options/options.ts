/**
 * Options page - depends on core VSC modules
 * Import required dependencies that are normally bundled in inject context
 */

// Core utilities and constants - must load first
import '../../utils/constants.ts';
import '../../utils/logger.ts';

// Storage and settings - depends on utils
import '../../core/storage-manager.ts';
import '../../core/settings.ts';
import type { KeyBinding, KeyModifiers, Settings } from '../../types/settings.ts';
import { createSettingsExport, parseSettingsImport } from '../../utils/settings-transfer.ts';

// UI helpers
import { createRow } from './row-renderer.ts';

// Initialize global namespace for options page
window.VSC = window.VSC || {};

type Any = any;

interface KeyInput extends HTMLInputElement {
  code?: string | null;
  keyCode?: number | null;
  displayKey?: string | null;
  modifiers?: KeyModifiers;
}

interface SiteRuleForm {
  pattern: string;
  enabled: boolean;
  speed: number | null;
}

interface ColumnSpec {
  key: string;
  type: 'text' | 'checkbox' | 'select';
  className: string;
  placeholder?: string;
  default?: unknown;
  options?: Array<[string, string]>;
}

function getElement<T = Any>(id: string): T {
  const element = document['getElementById'](id);
  if (!element) {
    throw new Error(`Options element not found: #${id}`);
  }
  return element as T;
}

function queryAll<T = Any>(selector: string): T[] {
  return Array.from(document['querySelectorAll'](selector)) as T[];
}

let keyBindings: KeyBinding[] = [];
let validationTimeout: ReturnType<typeof setTimeout> | null = null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendHighlightToken(parent: HTMLElement, className: string, text: string): void {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
}

function appendHighlightedCSS(parent: HTMLElement, text: string): void {
  const tokenPattern = /\/\*[\s\S]*?(?:\*\/|$)|[{}]|([\w-]+)(?=\s*:)|:\s*([^;{}]+)(;?)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[0].startsWith('/*')) {
      appendHighlightToken(parent, 'css-comment', match[0]);
    } else if (match[0] === '{' || match[0] === '}') {
      appendHighlightToken(parent, 'css-brace', match[0]);
    } else if (match[1]) {
      appendHighlightToken(parent, 'css-property', match[0]);
    } else if (match[2] !== undefined) {
      parent.appendChild(document.createTextNode(': '));
      appendHighlightToken(parent, 'css-value', match[2]);
      if (match[3]) {
        parent.appendChild(document.createTextNode(match[3]));
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

/** Sync textarea content to the highlighted <pre> overlay */
function updateCSSHighlight(): void {
  const textarea = getElement('controllerCSS');
  const highlight = getElement('cssHighlight');
  if (textarea && highlight) {
    highlight.replaceChildren();
    appendHighlightedCSS(highlight, `${textarea.value}\n`);
  }
}

/** Sync scroll position between textarea and highlight overlay */
function syncCSSScroll(): void {
  const textarea = getElement('controllerCSS');
  const highlight = getElement('cssHighlight');
  if (textarea && highlight) {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }
}

// Action labels — shared by predefined and custom shortcut rows
const ACTION_OPTIONS: Array<[string, string]> = [
  ['slower', 'Decrease speed'],
  ['faster', 'Increase speed'],
  ['rewind', 'Rewind'],
  ['advance', 'Advance'],
  ['reset', 'Reset speed'],
  ['fast', 'Preferred speed'],
  ['muted', 'Mute'],
  ['softer', 'Decrease volume'],
  ['louder', 'Increase volume'],
  ['pause', 'Pause'],
  ['mark', 'Set marker'],
  ['jump', 'Jump to marker'],
  ['display', 'Show/hide controller'],
];

// Column spec for shortcut rows (used by createRow)
const SHORTCUT_COLUMNS: ColumnSpec[] = [
  { key: 'action', type: 'select', className: 'customDo', options: ACTION_OPTIONS },
  { key: 'keyInput', type: 'text', className: 'customKey', placeholder: 'press a key' },
  { key: 'value', type: 'text', className: 'customValue', placeholder: 'value (0.10)' },
];

// Column spec for site rule rows
const SITE_RULE_COLUMNS: ColumnSpec[] = [
  { key: 'pattern', type: 'text', className: 'rulePattern', placeholder: 'youtube.com or /regex/' },
  { key: 'disabled', type: 'checkbox', className: 'ruleDisabled', default: false },
  { key: 'speed', type: 'text', className: 'ruleSpeed', placeholder: '(global)' },
];

/**
 * Validate CSS using the browser's own parser.
 * Updates the textarea border and validation message inline.
 * @param {string} css - CSS text to validate
 * @returns {boolean} true if valid (ok to save)
 */
/**
 * Find CSS rule blocks that the browser silently dropped.
 * Splits CSS into top-level rule blocks and tries each one individually.
 * @param {string} css - Original CSS text
 * @param {CSSStyleSheet} parsedSheet - Sheet from replaceSync (for count comparison)
 * @returns {string[]} Array of rule-block snippets that failed to parse
 */
function findDroppedRules(css: string, parsedSheet: CSSStyleSheet): string[] {
  // Split into top-level blocks by tracking brace depth
  const blocks = [];
  let depth = 0;
  let start = 0;
  // Strip comments first so braces inside comments don't confuse us
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '{') {
      depth++;
    } else if (stripped[i] === '}') {
      depth--;
      if (depth === 0) {
        blocks.push(css.substring(start, i + 1).trim());
        start = i + 1;
      }
    }
  }

  // Unclosed brace: the trailing chunk was never added to blocks
  if (depth !== 0) {
    const remainder = css.substring(start).trim();
    if (remainder) {
      const selector = remainder.split('{')[0].trim();
      return [selector || remainder.slice(0, 40)];
    }
  }

  // If total block count matches parsed rule count, nothing was dropped
  if (blocks.length <= parsedSheet.cssRules.length) {
    return [];
  }

  // Try each block individually to find which ones fail
  const dropped = [];
  const probe = new CSSStyleSheet();
  for (const block of blocks) {
    try {
      probe.replaceSync(block);
      if (probe.cssRules.length === 0) {
        // Extract the selector part for the message
        const selector = block.split('{')[0].trim();
        dropped.push(selector || block.slice(0, 40));
      }
    } catch {
      const selector = block.split('{')[0].trim();
      dropped.push(selector || block.slice(0, 40));
    }
  }
  return dropped;
}

function validateControllerCSS(css: string): boolean {
  const textarea = getElement('controllerCSS');
  const msg = getElement('cssValidation');
  textarea.classList.remove('css-error', 'css-warn');
  msg.classList.remove('error', 'warn');
  msg.textContent = '';

  if (!css.trim()) {
    return true;
  }

  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    const count = sheet.cssRules.length;

    if (count === 0) {
      textarea.classList.add('css-warn');
      msg.classList.add('warn');
      msg.textContent = 'No CSS rules parsed — check for syntax errors.';
      return true;
    }

    // Find rules that the browser silently dropped
    const dropped = findDroppedRules(css, sheet);
    if (dropped.length > 0) {
      textarea.classList.add('css-warn');
      msg.classList.add('warn');
      msg.textContent = `${count} rule${
        count !== 1 ? 's' : ''
      } parsed, ${dropped.length} dropped: ${dropped
        .map((r) => `"${r.slice(0, 40)}${r.length > 40 ? '...' : ''}"`)
        .join(', ')}`;
      return true;
    }

    return true;
  } catch (e: unknown) {
    textarea.classList.add('css-error');
    msg.classList.add('error');
    msg.textContent = `Syntax error: ${getErrorMessage(e).replace(/^Failed to execute.*: /, '')}`;
    return false;
  }
}

// TODO(v3): Remove keyCodeAliases once all bindings have displayKey field
// and the legacy `key` integer field is dropped from the schema.
const keyCodeAliases: Record<string, string> = {
  0: 'null',
  null: 'null',
  undefined: 'null',
  32: 'Space',
  37: 'Left',
  38: 'Up',
  39: 'Right',
  40: 'Down',
  96: 'Num 0',
  97: 'Num 1',
  98: 'Num 2',
  99: 'Num 3',
  100: 'Num 4',
  101: 'Num 5',
  102: 'Num 6',
  103: 'Num 7',
  104: 'Num 8',
  105: 'Num 9',
  106: 'Num *',
  107: 'Num +',
  109: 'Num -',
  110: 'Num .',
  111: 'Num /',
  112: 'F1',
  113: 'F2',
  114: 'F3',
  115: 'F4',
  116: 'F5',
  117: 'F6',
  118: 'F7',
  119: 'F8',
  120: 'F9',
  121: 'F10',
  122: 'F11',
  123: 'F12',
  124: 'F13',
  125: 'F14',
  126: 'F15',
  127: 'F16',
  128: 'F17',
  129: 'F18',
  130: 'F19',
  131: 'F20',
  132: 'F21',
  133: 'F22',
  134: 'F23',
  135: 'F24',
  186: ';',
  188: '<',
  189: '-',
  187: '+',
  190: '>',
  191: '/',
  192: '~',
  219: '[',
  220: '\\',
  221: ']',
  222: "'",
};

// Keyboard layout map — resolved once on page load, used for display labels
let layoutMap: Any = null;
(async function initLayoutMap() {
  try {
    const keyboard = (navigator as Any).keyboard;
    if (keyboard && keyboard.getLayoutMap) {
      layoutMap = await keyboard.getLayoutMap();
      // Re-render display labels if layout changes mid-session
      keyboard.addEventListener('layoutchange', async () => {
        layoutMap = await keyboard.getLayoutMap();
      });
    }
  } catch {
    // getLayoutMap not available — fallback chain handles it
  }
})();

/**
 * Build a display string for a shortcut.
 * @param {string} displayKey - event.key captured at recording time
 * @param {Object} [modifiers] - {ctrl, alt, shift, meta} booleans
 * @returns {string} e.g., "Ctrl + S", "Shift + P", "F10"
 */
function formatShortcutDisplay(displayKey: string, modifiers?: KeyModifiers): string {
  if (!displayKey) {
    return 'null';
  }
  const parts = [];
  if (modifiers) {
    if (modifiers.ctrl) {
      parts.push('Ctrl');
    }
    if (modifiers.alt) {
      parts.push('Alt');
    }
    if (modifiers.shift) {
      parts.push('Shift');
    }
    if (modifiers.meta) {
      parts.push('Meta');
    }
  }
  // Capitalize single-character keys for display
  const label = displayKey.length === 1 ? displayKey.toUpperCase() : displayKey;
  parts.push(label);
  return parts.join(' + ');
}

/**
 * Resolve the best display label for a binding.
 * Fallback chain: layoutMap → displayKey → keyCodeAliases → code → "null"
 */
function resolveDisplayLabel(binding: KeyBinding): string {
  // Try layout map first (most accurate for current keyboard)
  if (layoutMap && binding.code) {
    const mapped = layoutMap.get(binding.code);
    if (mapped) {
      return formatShortcutDisplay(mapped, binding.modifiers);
    }
  }
  // v2 binding with displayKey
  if (binding.displayKey) {
    return formatShortcutDisplay(binding.displayKey, binding.modifiers);
  }
  // v2 binding with code but no displayKey
  if (binding.code) {
    const derived = window.VSC.Constants.displayKeyFromCode(binding.code);
    return formatShortcutDisplay(derived, binding.modifiers);
  }
  // Legacy v1 binding — fall back to keyCodeAliases
  const kc = binding.keyCode ?? binding.key ?? 0;
  return keyCodeAliases[kc] || (kc >= 48 && kc <= 90 ? String.fromCharCode(kc) : `Key ${kc}`);
}

/**
 * Auto-size a key input to fit chord labels like "Ctrl + Shift + S".
 * Falls back to 75px minimum for simple keys.
 */
function autoSizeKeyInput(input: KeyInput): void {
  const minWidth = 75;
  if (!input.value || input.value.length <= 3) {
    input.style.width = `${minWidth}px`;
    return;
  }
  const span = document.createElement('span');
  span.style.visibility = 'hidden';
  span.style.position = 'absolute';
  span.style.font = getComputedStyle(input).font;
  span.style.whiteSpace = 'nowrap';
  span.textContent = input.value;
  document.body.appendChild(span);
  const textWidth = span.offsetWidth;
  document.body.removeChild(span);
  input.style.width = `${Math.max(minWidth, textWidth + 26)}px`;
}

function recordKeyPress(e: KeyboardEvent & { target: KeyInput }): void {
  // Special handling for backspace and escape (via event.code)
  if (e.code === 'Backspace') {
    e.target.value = '';
    e.target.code = null;
    e.target.keyCode = null;
    e.target.displayKey = null;
    e.target.modifiers = undefined;
    e.preventDefault();
    e.stopPropagation();
    return;
  } else if (e.code === 'Escape') {
    e.target.value = 'null';
    e.target.code = null;
    e.target.keyCode = null;
    e.target.displayKey = null;
    e.target.modifiers = undefined;
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Block blacklisted codes
  if (window.VSC.Constants.BLACKLISTED_CODES.has(e.code)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Capture v2 identity
  e.target.code = e.code;
  e.target.keyCode = e.keyCode;

  // Display: use the layout map when available — it shows the actual character
  // printed on the key for the user's current keyboard layout (e.g. "z" for the
  // KeyW physical key on AZERTY). Fall back to displayKeyFromCode for Numpad keys
  // where the layout map returns the same value as the main keyboard (both Enter
  // and NumpadEnter map to "Enter" in the layout map, so we need the explicit
  // "Num Enter" label from displayKeyFromCode to keep them visually distinct).
  const isNumpad = e.code.startsWith('Numpad');
  e.target.displayKey = isNumpad
    ? window.VSC.Constants.displayKeyFromCode(e.code) || e.key
    : layoutMap?.get(e.code) || window.VSC.Constants.displayKeyFromCode(e.code) || e.key;

  // Capture modifiers — only store object if any modifier is active
  const hasMod = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  e.target.modifiers = hasMod
    ? {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      }
    : undefined;

  // Display formatted shortcut
  e.target.value = formatShortcutDisplay(e.target.displayKey ?? e.key, e.target.modifiers);
  autoSizeKeyInput(e.target);

  // Show contextual warnings for problematic modifier combos
  clearWarning(e.target);
  if (e.ctrlKey && e.altKey) {
    showWarning(
      e.target,
      'This combination may conflict with AltGr input on some keyboard layouts.'
    );
  } else if (e.metaKey) {
    showWarning(e.target, 'Some Cmd/Meta combinations are intercepted by the OS and may not work.');
  }

  e.preventDefault();
  e.stopPropagation();
}

function showWarning(input: KeyInput, message: string): void {
  clearWarning(input);
  const warn = document.createElement('span');
  warn.className = 'shortcut-warning';
  warn.textContent = message;
  warn.style.cssText = 'display:block;color:#c57600;font-size:11px;margin-top:2px;';
  input.parentElement?.insertBefore(warn, input.nextSibling);
}

function clearWarning(input: KeyInput): void {
  const existing = input.parentElement?.querySelector('.shortcut-warning');
  if (existing) {
    existing.remove();
  }
}

function inputFilterNumbersOnly(e: InputEvent & { target: HTMLInputElement }): void {
  if ((e.inputType === 'insertText' || e.inputType === 'insertFromPaste') && e.data) {
    if (!/^\d+(\.\d*)?$/.test(e.target.value + e.data)) {
      e.preventDefault();
    }
  }
}

function inputFocus(e: Event & { target: KeyInput }): void {
  e.target.value = '';
}

function inputBlur(e: Event & { target: KeyInput }): void {
  // Reconstruct display from stored v2 fields, falling back to legacy
  if (e.target.code) {
    e.target.value = formatShortcutDisplay(
      e.target.displayKey || window.VSC.Constants.displayKeyFromCode(e.target.code),
      e.target.modifiers
    );
  } else if (e.target.code === null) {
    e.target.value = 'null';
  } else {
    // Legacy fallback
    const kc = e.target.keyCode ?? 0;
    e.target.value =
      keyCodeAliases[kc] || (kc >= 48 && kc <= 90 ? String.fromCharCode(kc) : `Key ${kc}`);
  }
  autoSizeKeyInput(e.target);
}

/**
 * Populate a shortcut input element with binding data.
 * Sets all v2 fields on the DOM element for round-trip through createKeyBindings.
 */
function setShortcutInput(input: KeyInput, binding: KeyBinding): void {
  input.code = binding.code;
  input.keyCode = binding.keyCode ?? binding.key;
  input.displayKey = binding.displayKey;
  input.modifiers = binding.modifiers;
  input.value = resolveDisplayLabel(binding);
  autoSizeKeyInput(input);
}

/**
 * Add a shortcut row (custom, not predefined).
 * @param {Object} [data] - Optional initial data { action, value }
 * @returns {HTMLElement} The created row
 */
function add_shortcut(data: Any = {}): HTMLElement {
  const container = getElement('shortcuts-container');
  const row = createRow(container, SHORTCUT_COLUMNS, data, {
    className: 'customs',
    removable: true,
  });
  // Hide value input for actions that don't need values
  const action = data.action || (row.querySelector('.customDo') as HTMLSelectElement).value;
  if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(action)) {
    (row.querySelector('.customValue') as HTMLElement).style.display = 'none';
  }
  return row;
}

/**
 * Add a predefined shortcut row (fixed action, no remove button).
 * @param {Object} data - Binding data { action, value, ... }
 * @returns {HTMLElement} The created row
 */
function add_predefined_shortcut(data: KeyBinding): HTMLElement {
  const container = getElement('shortcuts-container');
  const row = createRow(
    container,
    SHORTCUT_COLUMNS,
    { action: data.action },
    {
      className: 'customs',
      id: data.action,
      removable: false,
    }
  );
  // Predefined rows: lock the action dropdown
  const select = row.querySelector('.customDo') as HTMLSelectElement;
  select.disabled = true;
  // Set key input
  setShortcutInput(row.querySelector('.customKey') as KeyInput, data);
  // Set value input
  const valueInput = row.querySelector('.customValue') as HTMLInputElement;
  valueInput.value = String(data.value ?? '');
  // Hide value input for actions that don't need values
  if (window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(data.action)) {
    valueInput.style.display = 'none';
  }
  return row;
}

function createKeyBindings(item: Any): void {
  const action = (item.querySelector('.customDo') as HTMLSelectElement).value;
  const input = item.querySelector('.customKey') as KeyInput;
  const value = Number((item.querySelector('.customValue') as HTMLInputElement).value);
  const predefined = !!item.id;

  const binding: KeyBinding = {
    action: action,
    code: input.code, // PRIMARY — event.code string
    key: input.keyCode ?? undefined, // OLD field name — integer, downgrade compat
    keyCode: input.keyCode ?? undefined, // NEW field name — canonical legacy integer
    displayKey: input.displayKey ?? undefined, // display-friendly from event.key
    value: value,
    predefined: predefined,
  };

  // Only include modifiers when at least one is true
  if (input.modifiers) {
    binding.modifiers = input.modifiers;
  }

  keyBindings.push(binding);
}

// --- Site rule helpers ---

/**
 * Add a site rule row to the container.
 * @param {Object} [data] - { pattern, enabled, speed }
 * @returns {HTMLElement}
 */
function add_site_rule(data: Any = { enabled: true }): HTMLElement {
  const container = getElement('site-rules-container');
  const speedDisplay = data.speed !== null && data.speed !== undefined ? data.speed : undefined;
  return createRow(
    container,
    SITE_RULE_COLUMNS,
    { pattern: data.pattern, disabled: !data.enabled, speed: speedDisplay },
    { className: 'site-rule', removable: true }
  );
}

/**
 * Parse a speed input string.
 * Returns the numeric value, or null if empty/invalid.
 */
function parseSpeed(s: string | number | null | undefined): number | null {
  if (typeof s !== 'string') {
    return s ?? null;
  }
  const trimmed = s.trim();
  if (trimmed === '') {
    return null;
  }
  const v = parseFloat(trimmed);
  return isNaN(v) ? null : v;
}

/**
 * Collect site rules from the DOM.
 * @returns {Array<{pattern: string, enabled: boolean, speed: number|null}>}
 */
function collectSiteRules(): SiteRuleForm[] {
  const container = getElement('site-rules-container');
  return (Array.from(container.querySelectorAll('.row.site-rule')) as Element[])
    .map((row: Element) => ({
      pattern: (row.querySelector('.rulePattern') as HTMLInputElement).value.trim(),
      enabled: !(row.querySelector('.ruleDisabled') as HTMLInputElement).checked,
      speed: parseSpeed((row.querySelector('.ruleSpeed') as HTMLInputElement).value),
    }))
    .filter((r: SiteRuleForm) => r.pattern);
}

// Validates settings before saving
function validate(): boolean {
  let valid = true;
  const status = getElement('status');

  // Clear any existing timeout for validation errors
  if (validationTimeout) {
    clearTimeout(validationTimeout);
  }

  const regEndsWithFlags = window.VSC.Constants.regEndsWithFlags;

  // Validate site rules
  const rules = collectSiteRules();
  for (const rule of rules) {
    // Validate regex patterns
    if (rule.pattern.startsWith('/')) {
      try {
        const parts = rule.pattern.split('/');
        if (parts.length < 3) {
          throw 'invalid regex';
        }
        const hasFlags = regEndsWithFlags.test(rule.pattern);
        const flags = hasFlags ? parts.pop() : '';
        const regex = parts.slice(1, hasFlags ? undefined : -1).join('/');
        if (!regex) {
          throw 'empty regex';
        }
        new RegExp(regex, flags);
      } catch {
        status.textContent = `Error: Invalid site rule regex: "${rule.pattern}". Unable to save.`;
        status.classList.add('show', 'error');
        valid = false;
        validationTimeout = setTimeout(() => {
          status.textContent = '';
          status.classList.remove('show', 'error');
        }, 5000);
        return valid;
      }
    }

    // Validate speed range
    if (rule.speed !== null && rule.speed !== undefined) {
      if (
        rule.speed < window.VSC.Constants.SPEED_LIMITS.MIN ||
        rule.speed > window.VSC.Constants.SPEED_LIMITS.MAX
      ) {
        status.textContent = `Error: Speed for "${rule.pattern}" must be between ${
          window.VSC.Constants.SPEED_LIMITS.MIN
        } and ${window.VSC.Constants.SPEED_LIMITS.MAX}.`;
        status.classList.add('show', 'error');
        valid = false;
        validationTimeout = setTimeout(() => {
          status.textContent = '';
          status.classList.remove('show', 'error');
        }, 5000);
        return valid;
      }
    }
  }

  return valid;
}

// Saves options using VideoSpeedConfig system
async function save_options(): Promise<void> {
  if (validate() === false) {
    return;
  }

  const status = getElement('status');
  status.textContent = '';
  status.classList.remove('show', 'success', 'error');

  try {
    keyBindings = [];
    Array.from(queryAll('.customs')).forEach((item) => createKeyBindings(item));

    const rememberSpeed = getElement('rememberSpeed').checked;
    const exclusiveKeys = getElement('exclusiveKeys').checked;
    const audioBoolean = getElement('audioBoolean').checked;
    const startHidden = getElement('startHidden').checked;
    const controllerOpacity = Number(getElement('controllerOpacity').value);
    const controllerButtonSize = Number(getElement('controllerButtonSize').value);
    const controllerTheme = getElement('controllerTheme').value;
    const logLevel = parseInt(getElement('logLevel').value);
    const siteRules = collectSiteRules();
    const customCSS = getElement('controllerCSS').value;

    // Validate CSS syntax — block save on parse error
    if (!validateControllerCSS(customCSS)) {
      status.textContent = 'Error: Controller CSS has syntax errors. Fix them before saving.';
      status.classList.add('show', 'error');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('show', 'error');
      }, 5000);
      return;
    }

    // Byte-length guard for storage.sync per-item limits.
    const cssByteSize = new Blob([customCSS]).size;
    if (cssByteSize > 8192) {
      status.textContent = `Error: Controller CSS exceeds 8KB storage limit (${Math.round(cssByteSize / 1024)}KB). Reduce CSS size.`;
      status.classList.add('show', 'error');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('show', 'error');
      }, 5000);
      return;
    }

    // Ensure VideoSpeedConfig singleton is initialized
    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig();
    }

    // Use VideoSpeedConfig to save settings (sync storage)
    const settingsToSave: Partial<Settings> = {
      rememberSpeed: rememberSpeed,
      exclusiveKeys: exclusiveKeys,
      audioBoolean: audioBoolean,
      startHidden: startHidden,
      controllerOpacity: controllerOpacity,
      controllerButtonSize: controllerButtonSize,
      controllerTheme: controllerTheme,
      logLevel: logLevel,
      keyBindings: keyBindings,
      siteRules: siteRules,
    };

    settingsToSave.customCSS = customCSS;

    const ok = await window.VSC.videoSpeedConfig.save(settingsToSave);

    if (!ok) {
      status.textContent = 'Error: failed to save options to storage';
      status.classList.add('show', 'error');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('show', 'error');
      }, 3000);
    }
  } catch (error) {
    console.error('Failed to save options:', error);
    status.textContent = `Error saving options: ${getErrorMessage(error)}`;
    status.classList.add('show', 'error');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'error');
    }, 3000);
  }
}

// Restores options using VideoSpeedConfig system
async function restore_options(): Promise<void> {
  try {
    // Ensure VideoSpeedConfig singleton is initialized
    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig();
    }

    // Load settings using VideoSpeedConfig
    await window.VSC.videoSpeedConfig.load();
    const storage = window.VSC.videoSpeedConfig.settings;

    getElement('rememberSpeed').checked = storage.rememberSpeed;
    getElement('exclusiveKeys').checked = storage.exclusiveKeys;
    getElement('audioBoolean').checked = storage.audioBoolean;
    getElement('startHidden').checked = storage.startHidden;
    getElement('controllerOpacity').value = storage.controllerOpacity;
    getElement('controllerButtonSize').value = storage.controllerButtonSize;
    getElement('controllerTheme').value = storage.controllerTheme;
    getElement('logLevel').value = storage.logLevel;
    getElement('controllerCSS').value = storage.customCSS ?? '';

    // Render site rules
    const siteRules = storage.siteRules || window.VSC.Constants.DEFAULT_SETTINGS.siteRules;
    const rulesContainer = getElement('site-rules-container');
    // Clear existing rule rows but keep the header
    rulesContainer.querySelectorAll('.row.site-rule').forEach((r: Element) => r.remove());
    for (const rule of siteRules) {
      add_site_rule(rule);
    }

    // Process key bindings — all rows rendered dynamically
    const bindings = storage.keyBindings || window.VSC.Constants.DEFAULT_SETTINGS.keyBindings;

    // Clear existing shortcut rows (handles restore_defaults re-render)
    const shortcutsContainer = getElement('shortcuts-container');
    shortcutsContainer.replaceChildren();

    for (const item of bindings) {
      if (item.predefined) {
        add_predefined_shortcut(item);
      } else {
        const row = add_shortcut({ action: item.action, value: item.value });
        setShortcutInput(row.querySelector('.customKey') as KeyInput, item);
      }
    }
  } catch (error) {
    console.error('Failed to restore options:', error);
    getElement<HTMLElement>('status').textContent =
      `Error loading options: ${getErrorMessage(error)}`;
    getElement('status').classList.add('show', 'error');
    setTimeout(() => {
      getElement('status').textContent = '';
      getElement('status').classList.remove('show', 'error');
    }, 3000);
  }
}

async function restore_defaults(): Promise<void> {
  const status = getElement<HTMLElement>('status');
  try {
    status.textContent = 'Restoring defaults...';
    status.classList.remove('success', 'error');
    status.classList.add('show');

    // Clear all storage
    await window.VSC.StorageManager.clear();

    // Ensure VideoSpeedConfig singleton is initialized
    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig();
    }

    const defaults = { ...window.VSC.Constants.DEFAULT_SETTINGS, schemaVersion: 2 };
    const ok = await window.VSC.videoSpeedConfig.save(defaults);
    if (!ok) {
      throw new Error('failed to write defaults to storage');
    }

    // Reload the options page (clears and re-renders all shortcut rows)
    await restore_options();

    status.textContent = 'Default options restored';
    status.classList.add('success');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'success');
    }, 2000);
  } catch (error) {
    console.error('Failed to restore defaults:', error);
    status.textContent = `Error restoring defaults: ${getErrorMessage(error)}`;
    status.classList.add('show', 'error');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'error');
    }, 3000);
  }
}

/**
 * Export all settings as a JSON file download.
 */
async function export_settings(): Promise<void> {
  const status = getElement('status');
  try {
    // Ensure config is loaded
    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig();
    }
    await window.VSC.videoSpeedConfig.load();
    const settings = createSettingsExport(window.VSC.videoSpeedConfig.settings);

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = settings.exportedAt.slice(0, 10);
    a.download = `videospeed-settings-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    status.textContent = 'Settings exported';
    status.classList.remove('error');
    status.classList.add('show', 'success');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'success');
    }, 2000);
  } catch (error) {
    console.error('Failed to export settings:', error);
    status.textContent = `Error exporting settings: ${getErrorMessage(error)}`;
    status.classList.add('show', 'error');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'error');
    }, 3000);
  }
}

/**
 * Import settings from a JSON file. Validates structure before applying.
 */
function import_settings(): void {
  getElement('importFile').click();
}

async function handleImportFile(event: Event & { target: HTMLInputElement }): Promise<void> {
  const status = getElement('status');
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  // Reset the input so the same file can be re-selected
  event.target.value = '';

  try {
    const text = await file.text();
    let imported: unknown;
    try {
      imported = JSON.parse(text);
    } catch (e: unknown) {
      throw new Error('File is not valid JSON', { cause: e });
    }

    const settings = parseSettingsImport(imported);

    // Ensure config is initialized
    if (!window.VSC.videoSpeedConfig) {
      window.VSC.videoSpeedConfig = new window.VSC.VideoSpeedConfig();
    }
    await window.VSC.videoSpeedConfig.load();

    // A validated export contains every durable setting. Save it as a single
    // merge so an interrupted write cannot erase the user's existing config.
    const ok = await window.VSC.videoSpeedConfig.save(settings);
    if (!ok) {
      throw new Error('Failed to write imported settings to storage');
    }

    // Remove custom shortcut rows before reloading UI
    queryAll('.removeParent').forEach((button) => {
      button.click();
    });

    // Reload settings into the UI
    await restore_options();

    status.textContent = 'Settings imported successfully';
    status.classList.remove('error');
    status.classList.add('show', 'success');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'success');
    }, 2000);
  } catch (error) {
    console.error('Failed to import settings:', error);
    status.textContent = `Import failed: ${getErrorMessage(error)}`;
    status.classList.add('show', 'error');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('show', 'error');
    }, 4000);
  }
}

function switchTab(tabName: string): void {
  ['settings', 'advanced', 'faq'].forEach((name) => {
    getElement(`tab-${name}`).classList.toggle('active', name === tabName);
    getElement(`panel-${name}`).style.display = name === tabName ? '' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
  // Optional: Set up storage error monitoring for debugging/telemetry
  window.VSC.StorageManager.onError((error: Error, data: unknown) => {
    // Log to console for debugging, could also send telemetry
    console.warn('Storage operation failed:', error.message, data);
  });

  await restore_options();

  const saveBtn = getElement('save');

  // Dirty-state tracking: green button when unsaved changes exist,
  // dimmed briefly after save to confirm the action landed.
  function markDirty() {
    saveBtn.classList.add('has-changes');
    saveBtn.classList.remove('saved');
  }
  function markClean() {
    saveBtn.classList.remove('has-changes');
    saveBtn.classList.add('saved');
    setTimeout(() => saveBtn.classList.remove('saved'), 1500);
  }

  // Catch all form changes via delegation (covers dynamic rows too)
  document.body.addEventListener('input', markDirty);
  document.body.addEventListener('change', markDirty);

  saveBtn.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    await save_options();
    markClean();
  });

  getElement('add').addEventListener('click', () => {
    add_shortcut();
    markDirty();
  });
  getElement('add-site-rule').addEventListener('click', () => {
    add_site_rule();
    markDirty();
  });

  getElement('restore').addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    await restore_defaults();
    markDirty();
  });

  getElement('export').addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    export_settings();
  });

  getElement('import').addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    import_settings();
  });

  getElement('importFile').addEventListener('change', handleImportFile);

  getElement('tab-settings').addEventListener('click', () => switchTab('settings'));
  getElement('tab-advanced').addEventListener('click', () => switchTab('advanced'));
  getElement('tab-faq').addEventListener('click', () => switchTab('faq'));

  // Split button dropdown
  const splitMenu = getElement('split-menu');
  getElement('split-toggle').addEventListener('click', () => {
    splitMenu.hidden = !splitMenu.hidden;
  });
  document.addEventListener('click', (e: MouseEvent) => {
    if (!(e.target as Element | null)?.closest('.split-button')) {
      splitMenu.hidden = true;
    }
  });
  // Close dropdown after any menu action
  splitMenu.addEventListener('click', () => {
    splitMenu.hidden = true;
  });

  // CSS editor: live validation (debounced) + syntax highlighting + scroll sync
  const cssTextarea = getElement('controllerCSS');
  let cssValidationTimer: ReturnType<typeof setTimeout> | null = null;
  cssTextarea.addEventListener('input', () => {
    updateCSSHighlight();
    if (cssValidationTimer) {
      clearTimeout(cssValidationTimer);
    }
    cssValidationTimer = setTimeout(() => {
      validateControllerCSS(cssTextarea.value);
    }, 300);
  });
  cssTextarea.addEventListener('scroll', syncCSSScroll);

  // Initial highlight + validation
  updateCSSHighlight();
  validateControllerCSS(cssTextarea.value);

  // About and feedback button event listeners
  getElement('about').addEventListener('click', () => {
    window.open('https://github.com/igrigorik/videospeed');
  });

  getElement('feedback').addEventListener('click', () => {
    window.open('https://github.com/igrigorik/videospeed/issues');
  });

  function eventCaller(event: Event, className: string, funcName: (event: Any) => void): void {
    const target = event.target as HTMLElement | null;
    if (!target?.classList.contains(className)) {
      return;
    }
    funcName(event);
  }

  document.addEventListener('beforeinput', (event) => {
    eventCaller(event, 'customValue', inputFilterNumbersOnly);
  });
  document.addEventListener('focus', (event) => {
    eventCaller(event, 'customKey', inputFocus);
  });
  document.addEventListener('blur', (event) => {
    eventCaller(event, 'customKey', inputBlur);
  });
  document.addEventListener('keydown', (event) => {
    eventCaller(event, 'customKey', recordKeyPress);
  });
  document.addEventListener('click', (event) => {
    eventCaller(event, 'removeParent', () => {
      (event.target as HTMLElement).closest('.row')?.remove();
      markDirty();
    });
  });
  document.addEventListener('change', (event) => {
    eventCaller(event, 'customDo', () => {
      const row = (event.target as HTMLElement).closest('.row');
      if (!row) {
        return;
      }
      const valueInput = row.querySelector('.customValue') as HTMLInputElement;
      if (
        window.VSC.Constants.CUSTOM_ACTIONS_NO_VALUES.includes(
          (event.target as HTMLSelectElement).value
        )
      ) {
        valueInput.style.display = 'none';
        valueInput.value = '0';
      } else {
        valueInput.style.display = 'inline-block';
      }
    });
  });
});
