import type { ActionName } from '../utils/key-maps.ts';
import type { SiteRule } from '../utils/site-pattern.ts';
import type { ControllerTheme } from '../ui/controller-themes.ts';

export interface KeyModifiers {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface KeyBinding {
  action: ActionName | string;
  code?: string | null;
  key?: number;
  keyCode?: number;
  displayKey?: string;
  value: number;
  predefined?: boolean;
  modifiers?: KeyModifiers;
  [key: string]: unknown;
}

export interface Settings {
  schemaVersion: number;
  lastSpeed: number | null;
  enabled: boolean;
  rememberSpeed: boolean;
  exclusiveKeys: boolean;
  audioBoolean: boolean;
  startHidden: boolean;
  controllerOpacity: number;
  controllerButtonSize: number;
  controllerTheme: ControllerTheme;
  customCSS: string;
  keyBindings: KeyBinding[];
  siteRules: SiteRule[];
  blacklist: string;
  defaultLogLevel: number;
  logLevel: number;
  siteDefaultSpeed?: number;
  _abort?: boolean;
  controllerCSS?: string | null;
  [key: string]: unknown;
}

export type StoredSettings = Partial<Settings> & Record<string, unknown>;

export interface StorageChange<T = unknown> {
  oldValue?: T;
  newValue?: T;
}

export type StorageChanges = Record<string, StorageChange>;
