function currentApi() {
  return globalThis.browser || globalThis.chrome || null;
}

function usingBrowserPromises() {
  return !!globalThis.browser && currentApi() === globalThis.browser;
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
  if (usingBrowserPromises()) {
    return api.storage.sync.get(keys);
  }
  return callbackCall(api.storage.sync.get.bind(api.storage.sync), [keys]);
}

export function storageSet(items) {
  const api = currentApi();
  if (usingBrowserPromises()) {
    return api.storage.sync.set(items);
  }
  return callbackCall(api.storage.sync.set.bind(api.storage.sync), [items]);
}

export function storageRemove(keys) {
  const api = currentApi();
  if (usingBrowserPromises()) {
    return api.storage.sync.remove(keys);
  }
  return callbackCall(api.storage.sync.remove.bind(api.storage.sync), [keys]);
}

export function storageClear() {
  const api = currentApi();
  if (usingBrowserPromises()) {
    return api.storage.sync.clear();
  }
  return callbackCall(api.storage.sync.clear.bind(api.storage.sync));
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
