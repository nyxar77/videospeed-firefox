import type { StorageChanges } from '../types/settings.ts';

export interface StorageArea {
  get(
    keys?: unknown,
    callback?: (items: Record<string, unknown>) => void
  ): Promise<Record<string, unknown>> | void;
  set(items: Record<string, unknown>, callback?: () => void): Promise<void> | void;
  remove(keys: unknown, callback?: () => void): Promise<void> | void;
  clear(callback?: () => void): Promise<void> | void;
}

interface ApiEvent<Callback extends (...args: never[]) => void> {
  addListener(callback: Callback): void;
}

export interface ExtensionApi {
  storage: {
    sync?: StorageArea;
    local?: StorageArea;
    onChanged: ApiEvent<(changes: StorageChanges, areaName: string) => void>;
  };
  tabs: {
    query(queryInfo: unknown): Promise<unknown[]> | void;
    sendMessage(tabId: number, message: unknown): Promise<unknown> | void;
  };
  action: {
    setIcon(details: unknown): Promise<void> | void;
  };
  runtime: {
    openOptionsPage(): Promise<void> | void;
    lastError?: { message?: string };
    getManifest?(): {
      action?: { default_icon?: Record<string, string> | string };
    };
    onInstalled: ApiEvent<() => void | Promise<void>>;
    onStartup: ApiEvent<() => void | Promise<void>>;
    onMessage: ApiEvent<(request: unknown) => void>;
    sendMessage?(message: unknown, callback?: (response: unknown) => void): Promise<unknown> | void;
  };
}

function currentApi(): ExtensionApi | null {
  return (globalThis.browser || globalThis.chrome || null) as ExtensionApi | null;
}

function usingBrowserPromises(): boolean {
  const api = currentApi();
  return !!globalThis.browser && api === globalThis.browser;
}

function preferredStorageArea(api: ExtensionApi): StorageArea {
  // Firefox temporary add-ons do not have a stable signed add-on identity.
  // storage.local is the reliable persistence layer for local Firefox loads.
  if (usingBrowserPromises() && api.storage.local) {
    return api.storage.local;
  }
  const storage = api.storage.sync || api.storage.local;
  if (!storage) {
    throw new Error('No extension storage area is available');
  }
  return storage;
}

function lastError(): { message?: string } | null {
  return globalThis.chrome?.runtime?.lastError || null;
}

function callbackCall<T>(fn: (...args: unknown[]) => void, args: unknown[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    fn(...args, (result: T) => {
      const error = lastError();
      if (error) {
        reject(new Error(error.message || 'Extension API call failed'));
        return;
      }
      resolve(result);
    });
  });
}

export function getExtensionApi(): ExtensionApi | null {
  return currentApi();
}

export function storageGet<T extends Record<string, unknown> = Record<string, unknown>>(
  keys: unknown
): Promise<T> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.get(keys) as Promise<T>;
  }
  return callbackCall<T>(storage.get.bind(storage) as (...args: unknown[]) => void, [keys]);
}

export function storageSet(items: Record<string, unknown>): Promise<void> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.set(items) as Promise<void>;
  }
  return callbackCall<void>(storage.set.bind(storage) as (...args: unknown[]) => void, [items]);
}

export function storageRemove(keys: unknown): Promise<void> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.remove(keys) as Promise<void>;
  }
  return callbackCall<void>(storage.remove.bind(storage) as (...args: unknown[]) => void, [keys]);
}

export function storageClear(): Promise<void> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.clear() as Promise<void>;
  }
  return callbackCall<void>(storage.clear.bind(storage) as (...args: unknown[]) => void);
}

export function tabsQuery(queryInfo: unknown): Promise<unknown[]> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  if (usingBrowserPromises()) {
    return api.tabs.query(queryInfo) as Promise<unknown[]>;
  }
  return callbackCall<unknown[]>(api.tabs.query.bind(api.tabs) as (...args: unknown[]) => void, [
    queryInfo,
  ]);
}

export function tabsSendMessage<T = unknown>(tabId: number, message: unknown): Promise<T> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  if (usingBrowserPromises()) {
    return api.tabs.sendMessage(tabId, message) as Promise<T>;
  }
  return callbackCall<T>(api.tabs.sendMessage.bind(api.tabs) as (...args: unknown[]) => void, [
    tabId,
    message,
  ]);
}

export function actionSetIcon(details: unknown): Promise<void> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  if (usingBrowserPromises()) {
    return api.action.setIcon(details) as Promise<void>;
  }
  return callbackCall<void>(api.action.setIcon.bind(api.action) as (...args: unknown[]) => void, [
    details,
  ]);
}

export function openOptionsPage(): Promise<void> {
  const api = currentApi();
  if (!api) {
    return Promise.reject(new Error('Extension API is unavailable'));
  }
  if (usingBrowserPromises()) {
    return api.runtime.openOptionsPage() as Promise<void>;
  }
  return callbackCall<void>(
    api.runtime.openOptionsPage.bind(api.runtime) as (...args: unknown[]) => void
  );
}

export function runtimeSendMessage(message: unknown): Promise<void> {
  const api = currentApi();
  if (!api?.runtime.sendMessage) {
    return Promise.reject(new Error('Extension runtime messaging is unavailable'));
  }
  if (usingBrowserPromises()) {
    return api.runtime.sendMessage(message) as Promise<void>;
  }
  return callbackCall<void>(
    api.runtime.sendMessage.bind(api.runtime) as (...args: unknown[]) => void,
    [message]
  );
}
