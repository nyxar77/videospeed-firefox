import {
  getExtensionApi,
  storageClear,
  storageGet,
  storageRemove,
  storageSet,
} from '../utils/extension-api.ts';
import type { StorageChanges, StoredSettings } from '../types/settings.ts';

/**
 * WebExtension storage management utilities.
 *
 * Context-aware: uses extension storage when available, falls back to the
 * CustomEvent bridge with content-bridge.js in the MAIN world.
 */

window.VSC = window.VSC || {};

function hasExtensionStorage(): boolean {
  const api = getExtensionApi();
  return !!(api?.storage?.sync || api?.storage?.local);
}

if (!window.VSC.StorageManager) {
  const docEl = document.documentElement;

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  interface SettingsReadyDetail {
    abort?: boolean;
    settings?: StoredSettings;
  }

  const SETTINGS_REQUEST_TIMEOUT = 1000;
  const SETTINGS_REQUEST_RETRY_DELAYS = [0, 25, 75, 150, 300, 500];

  class StorageManager {
    static errorCallback: ((error: Error, data: Record<string, unknown>) => void) | null = null;

    /**
     * Register error callback for monitoring storage failures
     * @param {Function} callback - Callback function for errors
     */
    static onError(callback: (error: Error, data: Record<string, unknown>) => void): void {
      this.errorCallback = callback;
    }

    /**
     * @param {Object} defaults - Default values
     * @returns {Promise<Object>} Storage data
     */
    static async get(defaults: StoredSettings = {}): Promise<StoredSettings | null> {
      if (hasExtensionStorage()) {
        const storage = await storageGet<StoredSettings>(defaults);
        window.VSC.logger?.debug?.('StorageManager: settings from extension storage');
        return storage;
      }

      // No extension storage — request settings from bridge via CustomEvent
      return new Promise((resolve) => {
        let settled = false;
        let retryIndex = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = (): void => {
          settled = true;
          docEl.removeEventListener('VSC_SETTINGS_READY', onReady);
          if (retryTimer !== null) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          clearTimeout(timeout);
        };

        const onReady = (event: Event) => {
          if (settled) {
            return;
          }
          cleanup();
          const detail = (event as CustomEvent<SettingsReadyDetail>).detail;

          // Structured clone failure: detail is null when crossing worlds
          if (!detail) {
            window.VSC.logger?.error?.('StorageManager: bridge response is null (clone failed?)');
            resolve(defaults);
            return;
          }

          // Bridge signals abort for blacklisted/disabled sites
          if (detail.abort) {
            window.VSC.logger?.debug?.('StorageManager: site disabled by bridge');
            resolve(null);
            return;
          }

          window.VSC.logger?.debug?.('StorageManager: settings from bridge');
          resolve({ ...defaults, ...(detail.settings || {}) });
        };

        const timeout = setTimeout(() => {
          if (settled) {
            return;
          }
          cleanup();
          window.VSC.logger?.warn?.('StorageManager: settings timeout, using defaults');
          resolve(defaults);
        }, SETTINGS_REQUEST_TIMEOUT);

        const requestSettings = (): void => {
          if (settled) {
            return;
          }

          docEl.dispatchEvent(new CustomEvent('VSC_REQUEST_SETTINGS'));
          const nextDelay = SETTINGS_REQUEST_RETRY_DELAYS[retryIndex++];
          if (nextDelay !== undefined) {
            retryTimer = setTimeout(requestSettings, nextDelay);
          }
        };

        docEl.addEventListener('VSC_SETTINGS_READY', onReady);

        // Content-script worlds are started independently by Firefox. Retry
        // briefly so a MAIN-world request cannot be lost if the isolated
        // bridge has not registered its listener yet.
        requestSettings();
      });
    }

    /**
     * @param {Object} data - Data to store
     * @returns {Promise<void>}
     */
    static async set(data: Record<string, unknown>): Promise<void> {
      if (hasExtensionStorage()) {
        try {
          await storageSet(data);
          window.VSC.logger?.debug?.('StorageManager: saved to extension storage');
          return;
        } catch (error) {
          const message = errorMessage(error);
          const wrapped = new Error(`Storage failed: ${message}`);
          window.VSC.logger?.error?.(`Extension storage save failed: ${message}`);
          if (this.errorCallback) {
            this.errorCallback(wrapped, data);
          }
          throw wrapped;
        }
      }

      // Only lastSpeed can cross the trust boundary to extension storage
      const keys = Object.keys(data);
      if (keys.length === 1 && keys[0] === 'lastSpeed') {
        const speed = data.lastSpeed;
        if (typeof speed === 'number' && Number.isFinite(speed)) {
          docEl.dispatchEvent(
            new CustomEvent('VSC_WRITE_STORAGE', { detail: { lastSpeed: speed } })
          );
        } else {
          window.VSC.logger?.warn?.('StorageManager.set: invalid lastSpeed value');
        }
      } else {
        window.VSC.logger?.warn?.(
          `StorageManager.set: only lastSpeed bridgeable from MAIN. Keys: ${keys.join(', ')}`
        );
      }

      // Update local cache regardless (keeps in-memory state current)
      window.VSC_settings = { ...(window.VSC_settings || {}), ...data };
      return Promise.resolve();
    }

    /**
     * Remove keys from storage.
     * @param {Array<string>} keys - Keys to remove
     * @returns {Promise<void>}
     */
    static async remove(keys: string[]): Promise<void> {
      if (hasExtensionStorage()) {
        try {
          await storageRemove(keys);
          return;
        } catch (error) {
          const message = errorMessage(error);
          const wrapped = new Error(`Storage remove failed: ${message}`);
          window.VSC.logger?.error?.(`Extension storage remove failed: ${message}`);
          if (this.errorCallback) {
            this.errorCallback(wrapped, { removedKeys: keys });
          }
          throw wrapped;
        }
      }
      // No extension storage — update local cache only
      const settings = window.VSC_settings;
      if (settings) {
        keys.forEach((key) => delete settings[key]);
      }
      return Promise.resolve();
    }

    /**
     * Clear all storage.
     * @returns {Promise<void>}
     */
    static async clear(): Promise<void> {
      if (hasExtensionStorage()) {
        try {
          await storageClear();
          return;
        } catch (error) {
          const message = errorMessage(error);
          const wrapped = new Error(`Storage clear failed: ${message}`);
          window.VSC.logger?.error?.(`Extension storage clear failed: ${message}`);
          if (this.errorCallback) {
            this.errorCallback(wrapped, { operation: 'clear' });
          }
          throw wrapped;
        }
      }
      window.VSC_settings = {};
      return Promise.resolve();
    }

    /**
     * @param {Function} callback - Callback with changes in storage.onChanged format
     */
    static onChanged(callback: (changes: StorageChanges) => void): void {
      if (hasExtensionStorage()) {
        getExtensionApi()?.storage.onChanged?.addListener((changes, areaName) => {
          if (areaName === 'sync' || areaName === 'local') {
            callback(changes as StorageChanges);
          }
        });
      } else {
        docEl.addEventListener('VSC_STORAGE_CHANGED', (event) => {
          const changes = (event as CustomEvent<StorageChanges>).detail;
          for (const [key, change] of Object.entries(changes)) {
            if (change.newValue !== undefined) {
              window.VSC_settings = window.VSC_settings || {};
              window.VSC_settings[key] = change.newValue;
            }
          }
          callback(changes);
        });
      }
    }
  }

  window.VSC.StorageManager = StorageManager;
}
