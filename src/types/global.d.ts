export {};

declare global {
  interface VSCNamespace {
    [key: string]: any;
  }

  interface Window {
    VSC: VSCNamespace;
    VSC_controller?: any;
    VSC_settings?: Record<string, unknown>;
  }

  interface HTMLMediaElement {
    vsc?: { controllerId?: string };
  }

  var browser: any;
  var chrome: any;
}
