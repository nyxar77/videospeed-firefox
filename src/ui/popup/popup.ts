import {
  openOptionsPage,
  storageGet,
  storageSet,
  tabsQuery,
  tabsSendMessage,
} from '../../utils/extension-api.ts';
import type { KeyBinding, StoredSettings } from '../../types/settings.ts';

interface PopupSettings extends StoredSettings {
  enabled?: boolean;
  keyBindings?: KeyBinding[];
}

interface PopupMessage {
  type: string;
  payload: { speed?: number; delta?: number };
}

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Popup element not found: ${selector}`);
  }
  return element as T;
}

// Message type constants
const MessageTypes = {
  SET_SPEED: 'VSC_SET_SPEED',
  ADJUST_SPEED: 'VSC_ADJUST_SPEED',
  RESET_SPEED: 'VSC_RESET_SPEED',
  TOGGLE_DISPLAY: 'VSC_TOGGLE_DISPLAY',
};

document.addEventListener('DOMContentLoaded', (): void => {
  // Load settings and initialize speed controls
  loadSettingsAndInitialize();

  // Settings button event listener
  getElement<HTMLButtonElement>('#config').addEventListener('click', () => {
    openOptionsPage();
  });

  // Power button toggle event listener
  getElement<HTMLButtonElement>('#disable').addEventListener(
    'click',
    function (this: HTMLButtonElement) {
      // Toggle based on current state
      const isCurrentlyEnabled = !this.classList.contains('disabled');
      toggleEnabled(!isCurrentlyEnabled, settingsSavedReloadMessage);
    }
  );

  // Initialize enabled state
  storageGet<PopupSettings>({ enabled: true }).then((storage) => {
    toggleEnabledUI(storage.enabled !== false);
  });

  function toggleEnabled(enabled: boolean, callback?: (enabled: boolean) => void): void {
    storageSet({
      enabled: enabled,
    }).then(() => {
      toggleEnabledUI(enabled);
      if (callback) {
        callback(enabled);
      }
    });
  }

  function toggleEnabledUI(enabled: boolean): void {
    const disableBtn = getElement<HTMLButtonElement>('#disable');
    disableBtn.classList.toggle('disabled', !enabled);

    // Update tooltip
    disableBtn.title = enabled ? 'Disable Extension' : 'Enable Extension';
  }

  function settingsSavedReloadMessage(enabled: boolean): void {
    setStatusMessage(`${enabled ? 'Enabled' : 'Disabled'}. Reload page.`);
  }

  function setStatusMessage(str: string): void {
    const status_element = getElement<HTMLElement>('#status');
    status_element.classList.toggle('hide', false);
    status_element.innerText = str;
  }

  function clearStatusMessage(): void {
    const statusElement = getElement<HTMLElement>('#status');
    statusElement.classList.toggle('hide', true);
    statusElement.innerText = '';
  }

  // Load settings and initialize UI
  function loadSettingsAndInitialize(): void {
    storageGet<PopupSettings>(null).then((storage) => {
      // Find the step values from keyBindings
      let slowerStep = 0.1;
      let fasterStep = 0.1;
      let resetSpeed = 1.0;

      if (storage.keyBindings && Array.isArray(storage.keyBindings)) {
        const slowerBinding = storage.keyBindings.find((kb: KeyBinding) => kb.action === 'slower');
        const fasterBinding = storage.keyBindings.find((kb: KeyBinding) => kb.action === 'faster');
        const fastBinding = storage.keyBindings.find((kb: KeyBinding) => kb.action === 'fast');

        if (slowerBinding && typeof slowerBinding.value === 'number') {
          slowerStep = slowerBinding.value;
        }
        if (fasterBinding && typeof fasterBinding.value === 'number') {
          fasterStep = fasterBinding.value;
        }
        if (fastBinding && typeof fastBinding.value === 'number') {
          resetSpeed = fastBinding.value;
        }
      }

      // Update the UI with dynamic values
      updateSpeedControlsUI(slowerStep, fasterStep, resetSpeed);

      // Initialize event listeners
      initializeSpeedControls();
    });
  }

  function updateSpeedControlsUI(slowerStep: number, fasterStep: number, resetSpeed: number): void {
    // Update decrease button
    const decreaseBtn = getElement<HTMLButtonElement>('#speed-decrease');
    if (decreaseBtn) {
      decreaseBtn.dataset.delta = String(-slowerStep);
      getElement<HTMLSpanElement>('#speed-decrease span').textContent = `-${slowerStep}`;
    }

    // Update increase button
    const increaseBtn = getElement<HTMLButtonElement>('#speed-increase');
    if (increaseBtn) {
      increaseBtn.dataset.delta = String(fasterStep);
      getElement<HTMLSpanElement>('#speed-increase span').textContent = `+${fasterStep}`;
    }

    // Update reset button
    const resetBtn = getElement<HTMLButtonElement>('#speed-reset');
    if (resetBtn) {
      resetBtn.textContent = resetSpeed.toString();
    }
  }

  // Speed Control Functions
  function initializeSpeedControls(): void {
    // Set up speed control button listeners
    getElement<HTMLButtonElement>('#speed-decrease').addEventListener(
      'click',
      function (this: HTMLButtonElement) {
        const delta = parseFloat(this.dataset.delta ?? '0');
        adjustSpeed(delta);
      }
    );

    getElement<HTMLButtonElement>('#speed-increase').addEventListener(
      'click',
      function (this: HTMLButtonElement) {
        const delta = parseFloat(this.dataset.delta ?? '0');
        adjustSpeed(delta);
      }
    );

    getElement<HTMLButtonElement>('#speed-reset').addEventListener(
      'click',
      function (this: HTMLButtonElement) {
        // Set directly to preferred speed instead of toggling
        const preferredSpeed = parseFloat(this.textContent);
        setSpeed(preferredSpeed);
      }
    );

    // Set up preset button listeners
    document.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', function (this: HTMLButtonElement) {
        const speed = parseFloat(this.dataset.speed ?? '1');
        setSpeed(speed);
      });
    });
  }

  async function sendActiveTabMessage(message: PopupMessage): Promise<boolean> {
    try {
      const tabs = (await tabsQuery({ active: true, currentWindow: true })) as Array<{
        id?: number;
      }>;
      const tab = tabs[0];
      if (!tab?.id) {
        setStatusMessage('No active tab.');
        return false;
      }

      await tabsSendMessage(tab.id, message);
      clearStatusMessage();
      return true;
    } catch (error: unknown) {
      setStatusMessage('Reload page to activate.');
      console.warn('[VSC] Could not message active tab:', error);
      return false;
    }
  }

  function setSpeed(speed: number): void {
    sendActiveTabMessage({
      type: MessageTypes.SET_SPEED,
      payload: { speed: speed },
    });
  }

  function adjustSpeed(delta: number): void {
    sendActiveTabMessage({
      type: MessageTypes.ADJUST_SPEED,
      payload: { delta: delta },
    });
  }
});
