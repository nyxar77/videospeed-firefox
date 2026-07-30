import {
  actionSetIcon,
  getExtensionApi,
  storageGet,
  storageRemove,
  storageSet,
  type ExtensionApi,
} from './utils/extension-api.ts';
import type { KeyBinding, StoredSettings } from './types/settings.ts';
import { TimeSavedAccumulator } from './core/time-saved-accumulator.ts';
import { TIME_SAVED_STORAGE_KEY } from './utils/time-saved.ts';

const extensionApi = getExtensionApi() as ExtensionApi;
const MAX_TIME_SAVED_DELTA_MS = 15 * 60 * 1000;
const timeSavedAccumulator = new TimeSavedAccumulator({
  async read(): Promise<number> {
    const storage = await storageGet<Record<string, unknown>>({ [TIME_SAVED_STORAGE_KEY]: 0 });
    const existing = storage[TIME_SAVED_STORAGE_KEY];
    return typeof existing === 'number' && Number.isFinite(existing) ? existing : 0;
  },
  write(milliseconds: number): Promise<void> {
    return storageSet({ [TIME_SAVED_STORAGE_KEY]: milliseconds });
  },
});

function addTimeSaved(milliseconds: number): void {
  void timeSavedAccumulator
    .add(milliseconds)
    .catch((error) => console.error('[VSC] Failed to store saved-time statistic:', error));
}

extensionApi.runtime.onMessage.addListener((request: unknown) => {
  if (!request || typeof request !== 'object') {
    return;
  }
  const { type, milliseconds } = request as { type?: unknown; milliseconds?: unknown };
  if (
    type === 'VSC_ADD_TIME_SAVED' &&
    typeof milliseconds === 'number' &&
    Number.isInteger(milliseconds) &&
    milliseconds > 0 &&
    milliseconds <= MAX_TIME_SAVED_DELTA_MS
  ) {
    addTimeSaved(milliseconds);
  }
});

function getActionIconDirectory(): string {
  const defaultIcon = extensionApi.runtime.getManifest?.().action?.default_icon;
  const icon16Path =
    typeof defaultIcon === 'string' ? defaultIcon : defaultIcon?.['16'] || defaultIcon?.[16];

  if (typeof icon16Path === 'string') {
    return icon16Path.replace(/icon16\.png$/, '');
  }

  return 'assets/icons/';
}

const actionIconDirectory = getActionIconDirectory();

async function updateIcon(enabled: boolean): Promise<void> {
  try {
    const suffix = enabled ? '' : '_disabled';
    await actionSetIcon({
      path: {
        16: `${actionIconDirectory}icon16${suffix}.png`,
        32: `${actionIconDirectory}icon32${suffix}.png`,
        48: `${actionIconDirectory}icon48${suffix}.png`,
        64: `${actionIconDirectory}icon64${suffix}.png`,
      },
    });
    console.log(`Icon updated: ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    console.error('Failed to update icon:', error);
  }
}

async function initializeIcon(): Promise<void> {
  try {
    const storage = await storageGet<StoredSettings>({ enabled: true });
    await updateIcon(storage.enabled !== false);
  } catch (error) {
    console.error('Failed to initialize icon:', error);
    await updateIcon(true);
  }
}

/**
 * Migrate storage to current config version
 * Removes deprecated keys from older versions
 */
async function migrateConfig(): Promise<void> {
  const DEPRECATED_KEYS = [
    // Removed in v0.9.x
    'speeds',
    'version',

    // Replaced by smarter fight-back defaults in event-manager.js
    'forceLastSavedSpeed',

    // Migrated to keyBindings array in v0.6.x
    'resetSpeed',
    'speedStep',
    'fastSpeed',
    'rewindTime',
    'advanceTime',
    'resetKeyCode',
    'slowerKeyCode',
    'fasterKeyCode',
    'rewindKeyCode',
    'advanceKeyCode',
    'fastKeyCode',
    'displayKeyCode',
  ];

  try {
    await storageRemove(DEPRECATED_KEYS);
    console.log('[VSC] Config migrated to current version');
  } catch (error) {
    console.error('[VSC] Config migration failed:', error);
  }
}

// ---------------------------------------------------------------------------
// Key-binding schema v2 migration: keyCode integers → event.code strings
// ---------------------------------------------------------------------------
// Runs in the background context with direct extension storage access.
// Content scripts that load before this completes
// use the legacy keyCode fallback path in event-manager.js.

import {
  PREDEFINED_CODE_MAP,
  KEYCODE_TO_CODE,
  displayKeyFromCode,
  PREDEFINED_ACTIONS,
  DEFAULT_BINDINGS,
} from './utils/key-maps.ts';

/**
 * Migrate key bindings from v1 (keyCode integers) to v2 (event.code strings).
 *
 * Four phases:
 *   1. Predefined bindings — hardcoded map, zero ambiguity
 *   2. Custom bindings — KEYCODE_TO_CODE best-effort lookup
 *   3. Unmappable keyCodes — set code: null (already broken, user re-records)
 *   4. Ensure all 9 predefined actions exist (replaces ensureDisplayBinding)
 *
 * Single atomic storage write. Idempotent — safe to re-run.
 */
async function migrateKeyBindingsV2(): Promise<void> {
  try {
    const storage = await storageGet<StoredSettings>(null);
    const bindings = storage.keyBindings as KeyBinding[] | undefined;

    // No bindings in storage → fresh install, v2 defaults applied directly
    if (!bindings || !Array.isArray(bindings) || bindings.length === 0) {
      console.log('[VSC] Migration: no keyBindings in storage, skipping (fresh install)');
      return;
    }

    // Idempotency: skip if already fully migrated.
    // Don't trust schemaVersion alone — verify bindings actually have code fields.
    if (storage.schemaVersion === 2 && bindings.every((b) => b.code !== undefined)) {
      console.log('[VSC] Migration: already at v2, skipping');
      return;
    }

    let predefinedCount = 0;
    let customCount = 0;
    let unmappableCount = 0;

    const migrated = bindings.map((binding: KeyBinding) => {
      // Per-binding idempotency: skip if already has code field
      if (binding.code !== undefined) {
        return binding;
      }

      const legacyKey = binding.key ?? 0;

      // Phase 1: Predefined bindings — hardcoded zero-ambiguity mapping
      if (binding.predefined && PREDEFINED_CODE_MAP[legacyKey]) {
        const mapped = PREDEFINED_CODE_MAP[legacyKey];
        predefinedCount++;
        return {
          ...binding,
          code: mapped.code,
          keyCode: legacyKey,
          displayKey: mapped.displayKey,
        };
      }

      // Phase 2: Custom bindings — best-effort KEYCODE_TO_CODE lookup
      const code = KEYCODE_TO_CODE[legacyKey];
      if (code) {
        customCount++;
        return {
          ...binding,
          code: code,
          keyCode: legacyKey,
          displayKey: displayKeyFromCode(code),
        };
      }

      // Phase 3: Unmappable keyCodes (0, null, 255, OEM-specific, etc.)
      unmappableCount++;
      console.info(
        `[VSC] Migration: unmappable keyCode ${legacyKey} for action "${binding.action}"`
      );
      return {
        ...binding,
        code: null,
        keyCode: legacyKey,
        displayKey: '',
      };
    });

    // Phase 4: Ensure all 9 predefined actions exist
    const existingActions = new Set(migrated.map((b: KeyBinding) => b.action));
    for (const action of PREDEFINED_ACTIONS) {
      if (!existingActions.has(action)) {
        const defaults = DEFAULT_BINDINGS[action];
        migrated.push({
          action,
          ...defaults,
          predefined: true,
        });
        console.info(`[VSC] Migration: added missing predefined action "${action}"`);
      }
    }

    // Single atomic write
    await storageSet({
      keyBindings: migrated,
      schemaVersion: 2,
    });

    console.log(
      `[VSC] Migration: ${predefinedCount} predefined, ${customCount} custom (${unmappableCount} unmappable)`
    );
  } catch (error) {
    console.error('[VSC] Key binding migration failed:', error);
  }
}

/**
 * Listen for storage changes (extension enabled/disabled)
 */
extensionApi.storage.onChanged.addListener((changes, namespace) => {
  if ((namespace === 'sync' || namespace === 'local') && changes.enabled) {
    updateIcon(changes.enabled.newValue !== false);
  }
});

/**
 * Initialize on install/update
 */
extensionApi.runtime.onInstalled.addListener(async () => {
  console.log('Video Speed Controller installed/updated');
  await migrateConfig();
  await migrateKeyBindingsV2();
  await initializeIcon();
});

/**
 * Initialize on startup
 */
extensionApi.runtime.onStartup.addListener(async () => {
  console.log('Video Speed Controller started');
  await initializeIcon();
});

// Initialize immediately when the background context loads
initializeIcon();

console.log('Video Speed Controller background script loaded');
