export {};

declare global {
  interface VSCNamespace {
    [key: string]: any;
  }

  interface Window {
    VSC: VSCNamespace;
    VSC_controller?: any;
    VSC_settings?: Record<string, unknown>;
    vscDebug?: Record<string, unknown>;
    vscDebugHelper?: unknown;
  }

  interface VSCControllerState {
    controllerId: string;
    div: HTMLElement & { flashTimer?: ReturnType<typeof setTimeout> };
    speedIndicator: HTMLElement;
    speedBeforeReset: number | null;
    positionBeforeJump: number | null;
    mark: number | null;
    remove(): void;
    setTheme(theme: import('../ui/controller-themes.ts').ControllerTheme): void;
    updateVisibility(): void;
  }

  interface HTMLMediaElement {
    vsc?: VSCControllerState;
  }

  var browser: any;
  var chrome: any;
}
