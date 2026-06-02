function currentApi() {
  return globalThis.browser || globalThis.chrome || null;
}

function usingBrowserPromises() {
  return !!globalThis.browser && currentApi() === globalThis.browser;
}

function preferredStorageArea(api) {
  // Firefox temporary add-ons do not have a stable signed add-on identity.
  // storage.local is the reliable persistence layer for local Firefox loads.
  if (usingBrowserPromises() && api.storage.local) {
    return api.storage.local;
  }
  return api.storage.sync || api.storage.local;
}

function lastError() {
  return globalThis.chrome?.runtime?.lastError || null;
}

function callbackCall(fn, args = []) {
  return new Promise((resolve, reject) => {
    fn(...args, (result) => {
      const error = lastError();
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

export function getExtensionApi() {
  return currentApi();
}

export function storageGet(keys) {
  const api = currentApi();
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.get(keys);
  }
  return callbackCall(storage.get.bind(storage), [keys]);
}

export function storageSet(items) {
  const api = currentApi();
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.set(items);
  }
  return callbackCall(storage.set.bind(storage), [items]);
}

export function storageRemove(keys) {
  const api = currentApi();
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.remove(keys);
  }
  return callbackCall(storage.remove.bind(storage), [keys]);
}

export function storageClear() {
  const api = currentApi();
  const storage = preferredStorageArea(api);
  if (usingBrowserPromises()) {
    return storage.clear();
  }
  return callbackCall(storage.clear.bind(storage));
}

export function tabsQuery(queryInfo) {
  const api = currentApi();
  if (usingBrowserPromises()) {
    return api.tabs.query(queryInfo);
  }
  return callbackCall(api.tabs.query.bind(api.tabs), [queryInfo]);
}

export function tabsSendMessage(tabId, message) {
  const api = currentApi();
  if (usingBrowserPromises()) {
    return api.tabs.sendMessage(tabId, message);
  }
  return callbackCall(api.tabs.sendMessage.bind(api.tabs), [tabId, message]);
}

export function actionSetIcon(details) {
  const api = currentApi();
  if (usingBrowserPromises()) {
    return api.action.setIcon(details);
  }
  return callbackCall(api.action.setIcon.bind(api.action), [details]);
}

export function openOptionsPage() {
  const api = currentApi();
  if (usingBrowserPromises()) {
    return api.runtime.openOptionsPage();
  }
  return callbackCall(api.runtime.openOptionsPage.bind(api.runtime));
}
