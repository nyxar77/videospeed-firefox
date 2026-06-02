import {
  getExtensionApi,
  storageClear,
  storageGet,
  storageRemove,
  storageSet,
} from '../utils/extension-api.js';

/**
 * WebExtension storage management utilities.
 *
 * Context-aware: uses extension storage when available, falls back to the
 * CustomEvent bridge with content-bridge.js in the MAIN world.
 */

window.VSC = window.VSC || {};

function hasExtensionStorage() {
  const api = getExtensionApi();
  return !!api?.storage?.sync;
}

if (!window.VSC.StorageManager) {
  const docEl = document.documentElement;

  class StorageManager {
    static errorCallback = null;

    /**
     * Register error callback for monitoring storage failures
     * @param {Function} callback - Callback function for errors
     */
    static onError(callback) {
      this.errorCallback = callback;
    }

    /**
     * @param {Object} defaults - Default values
     * @returns {Promise<Object>} Storage data
     */
    static async get(defaults = {}) {
      if (hasExtensionStorage()) {
        const storage = await storageGet(defaults);
        window.VSC.logger?.debug?.('StorageManager: settings from extension storage');
        return storage;
      }

      // No extension storage — request settings from bridge via CustomEvent
      return new Promise((resolve) => {
        const onReady = (e) => {
          docEl.removeEventListener('VSC_SETTINGS_READY', onReady);
          clearTimeout(timeout);
          const detail = e.detail;

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
          resolve({ ...defaults, ...detail.settings });
        };

        const timeout = setTimeout(() => {
          docEl.removeEventListener('VSC_SETTINGS_READY', onReady);
          window.VSC.logger?.warn?.('StorageManager: settings timeout, using defaults');
          resolve(defaults);
        }, 2000);

        docEl.addEventListener('VSC_SETTINGS_READY', onReady);

        docEl.dispatchEvent(new CustomEvent('VSC_REQUEST_SETTINGS'));
      });
    }

    /**
     * @param {Object} data - Data to store
     * @returns {Promise<void>}
     */
    static async set(data) {
      if (hasExtensionStorage()) {
        try {
          await storageSet(data);
          window.VSC.logger?.debug?.('StorageManager: saved to extension storage');
          return;
        } catch (error) {
          const wrapped = new Error(`Storage failed: ${error.message}`);
          window.VSC.logger?.error?.(`Extension storage save failed: ${error.message}`);
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
      window.VSC_settings = { ...window.VSC_settings, ...data };
      return Promise.resolve();
    }

    /**
     * Remove keys from storage.
     * @param {Array<string>} keys - Keys to remove
     * @returns {Promise<void>}
     */
    static async remove(keys) {
      if (hasExtensionStorage()) {
        try {
          await storageRemove(keys);
          return;
        } catch (error) {
          const wrapped = new Error(`Storage remove failed: ${error.message}`);
          window.VSC.logger?.error?.(`Extension storage remove failed: ${error.message}`);
          if (this.errorCallback) {
            this.errorCallback(wrapped, { removedKeys: keys });
          }
          throw wrapped;
        }
      }
      // No extension storage — update local cache only
      if (window.VSC_settings) {
        keys.forEach((key) => delete window.VSC_settings[key]);
      }
      return Promise.resolve();
    }

    /**
     * Clear all storage.
     * @returns {Promise<void>}
     */
    static async clear() {
      if (hasExtensionStorage()) {
        try {
          await storageClear();
          return;
        } catch (error) {
          const wrapped = new Error(`Storage clear failed: ${error.message}`);
          window.VSC.logger?.error?.(`Extension storage clear failed: ${error.message}`);
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
    static onChanged(callback) {
      if (hasExtensionStorage()) {
        getExtensionApi().storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'sync') {
            callback(changes);
          }
        });
      } else {
        docEl.addEventListener('VSC_STORAGE_CHANGED', (e) => {
          const changes = e.detail;
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
