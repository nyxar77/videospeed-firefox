/**
 * Content Bridge — ISOLATED world thin bridge for extension API access.
 *
 * Runs at document_start. Communicates with inject.js (MAIN world) via
 * CustomEvents on document.documentElement.
 *
 * Settings handshake:
 *   1. Bridge stashes settings in closure, registers VSC_REQUEST_SETTINGS listener
 *   2. MAIN world fires VSC_REQUEST_SETTINGS at document_idle
 *   3. Bridge responds with VSC_SETTINGS_READY (synchronous within same tick)
 */

import { isBlacklisted } from '../utils/blacklist.ts';
import {
  getExtensionApi,
  storageGet,
  storageSet,
  type ExtensionApi,
} from '../utils/extension-api.ts';
import { matchSiteRule } from '../utils/site-pattern.ts';
import type { StorageChanges, StoredSettings } from '../types/settings.ts';

// Speed limits for page→bridge write validation.
// Duplicated from constants.ts (ISOLATED world can't import page modules).
const SPEED_MIN = 0.07;
const SPEED_MAX = 16;

const docEl = document.documentElement;
let bridgeInitialized = false;
const extensionApi = getExtensionApi() as ExtensionApi;

function cloneDetailForPage(detail: unknown): unknown {
  try {
    const cloneInto = (
      globalThis as typeof globalThis & {
        cloneInto?: (
          value: unknown,
          target: Window,
          options: { cloneFunctions: boolean }
        ) => unknown;
      }
    ).cloneInto;
    if (typeof cloneInto === 'function') {
      return cloneInto(detail, window, { cloneFunctions: false });
    }
  } catch (error: unknown) {
    console.warn('[VSC] Failed to clone event detail for page:', error);
  }
  return detail;
}

function dispatchToPage(type: string, detail: unknown): void {
  docEl.dispatchEvent(new CustomEvent(type, { detail: cloneDetailForPage(detail) }));
}

async function init() {
  try {
    // Skip about:blank frames — they share the parent window
    if (location.href === 'about:blank') {
      return;
    }

    // Double-injection guard (module-level flag resets on page navigation)
    if (bridgeInitialized) {
      return;
    }
    bridgeInitialized = true;

    const settings = await storageGet<StoredSettings>(null);

    const disabled = settings.enabled === false;
    // Legacy blacklist: only checked when siteRules hasn't been initialized yet
    // (pre-migration devices). Once migration runs, siteRules is the source of
    // truth. The blacklist is preserved in storage for sync compat with older
    // extension versions but must not shadow siteRules edits.
    const blacklisted = !settings.siteRules && isBlacklisted(settings.blacklist, location.href);
    const siteRuleMatch = matchSiteRule(settings.siteRules, location.href);
    const siteDisabled = siteRuleMatch && siteRuleMatch.enabled === false;
    const shouldAbort = disabled || blacklisted || siteDisabled;

    // Always respond — inject.js runs unconditionally and needs the abort
    // signal to skip init. { once: true } limits event forgery exposure.
    if (shouldAbort) {
      docEl.addEventListener(
        'VSC_REQUEST_SETTINGS',
        () => {
          dispatchToPage('VSC_SETTINGS_READY', { abort: true });
        },
        { once: true }
      );
      return;
    }

    const hostname = location.hostname.replace(/^www\./, '');

    // Strip keys the MAIN world shouldn't see
    delete settings.blacklist;
    delete settings.enabled;

    const settingsPayload = { settings, hostname };

    docEl.addEventListener(
      'VSC_REQUEST_SETTINGS',
      () => {
        dispatchToPage('VSC_SETTINGS_READY', settingsPayload);
      },
      { once: true }
    );

    // --- Ongoing: storage change relay + lifecycle ---
    extensionApi.storage.onChanged.addListener((changes: StorageChanges, namespace: string) => {
      if (namespace !== 'sync' && namespace !== 'local') {
        return;
      }

      // Lifecycle: only the popup's enabled toggle triggers teardown/reinit.
      // Options page never writes `enabled`, so saving options can't trigger
      // lifecycle — it only relays settings via VSC_STORAGE_CHANGED below.
      // siteRules/blacklist changes take effect on next page load.
      if (changes.enabled?.newValue === false) {
        dispatchToPage('VSC_MESSAGE', { type: 'VSC_TEARDOWN' });
        return;
      }
      if (changes.enabled?.oldValue === false && changes.enabled?.newValue !== false) {
        dispatchToPage('VSC_MESSAGE', { type: 'VSC_REINIT' });
      }

      // Relay changes to MAIN world (filter out keys MAIN never received)
      const relayChanges = { ...changes };
      delete relayChanges.enabled;
      delete relayChanges.blacklist;
      if (Object.keys(relayChanges).length > 0) {
        dispatchToPage('VSC_STORAGE_CHANGED', relayChanges);
      }
    });

    // --- Ongoing: popup/background message relay ---
    extensionApi.runtime.onMessage.addListener((request: unknown) => {
      dispatchToPage('VSC_MESSAGE', request);
    });

    // --- Ongoing: speed write-back from MAIN world ---
    const handleWriteStorage = (e: CustomEvent<{ lastSpeed?: unknown }>): void => {
      try {
        const data = e.detail as Record<string, unknown> | null;
        if (!data || typeof data !== 'object') {
          return;
        }

        // Only lastSpeed can be written from MAIN world (trust boundary)
        if ('lastSpeed' in data) {
          const speed = data.lastSpeed;
          if (typeof speed === 'number' && Number.isFinite(speed)) {
            const clamped = Math.min(Math.max(speed, SPEED_MIN), SPEED_MAX);
            storageSet({ lastSpeed: clamped });
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Extension context invalidated')) {
          docEl.removeEventListener('VSC_WRITE_STORAGE', handleWriteStorage as EventListener);
        }
      }
    };
    docEl.addEventListener('VSC_WRITE_STORAGE', handleWriteStorage as EventListener);
  } catch (error) {
    console.error('[VSC] Bridge init failed:', error);
  }
}

init();
