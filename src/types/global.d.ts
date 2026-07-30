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

  var browser: any;
  var chrome: any;
}
