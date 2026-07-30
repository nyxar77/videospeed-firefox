import type { KeyBinding, KeyModifiers, Settings } from '../types/settings.ts';
import type { SiteRule } from './site-pattern.ts';
import { normalizeControllerTheme } from '../ui/controller-themes.ts';

export const SETTINGS_EXPORT_FORMAT = 'videospeed-settings';
export const SETTINGS_EXPORT_VERSION = 1;

const SPEED_MIN = 0.07;
const SPEED_MAX = 16;
const MAX_CUSTOM_CSS_BYTES = 8192;
const MAX_PATTERN_LENGTH = 512;
const MAX_BINDINGS = 100;
const MAX_SITE_RULES = 250;

const PORTABLE_SETTING_KEYS = [
  'schemaVersion',
  'lastSpeed',
  'enabled',
  'rememberSpeed',
  'exclusiveKeys',
  'audioBoolean',
  'startHidden',
  'controllerOpacity',
  'controllerButtonSize',
  'controllerTheme',
  'customCSS',
  'keyBindings',
  'siteRules',
  'blacklist',
  'defaultLogLevel',
  'logLevel',
] as const satisfies readonly (keyof Settings)[];

type PortableSettings = Pick<Settings, (typeof PORTABLE_SETTING_KEYS)[number]>;

export interface SettingsExport {
  format: typeof SETTINGS_EXPORT_FORMAT;
  version: typeof SETTINGS_EXPORT_VERSION;
  exportedAt: string;
  settings: PortableSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertBoolean(value: unknown, key: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid ${key}: expected true or false`);
  }
}

function assertFiniteNumber(
  value: unknown,
  key: string,
  min: number,
  max: number
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${key}: expected a number between ${min} and ${max}`);
  }
}

function parseModifiers(value: unknown): KeyModifiers | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error('Invalid key binding modifiers');
  }

  const modifiers: KeyModifiers = {};
  for (const key of ['shift', 'ctrl', 'alt', 'meta'] as const) {
    if (value[key] !== undefined) {
      assertBoolean(value[key], `key binding modifier ${key}`);
      modifiers[key] = value[key];
    }
  }
  return modifiers;
}

function parseKeyBinding(value: unknown): KeyBinding {
  if (!isRecord(value) || typeof value.action !== 'string' || value.action.trim().length === 0) {
    throw new Error('Invalid key binding action');
  }
  if (value.action.length > MAX_PATTERN_LENGTH) {
    throw new Error('Invalid key binding action: too long');
  }
  assertFiniteNumber(value.value, `value for ${value.action}`, -SPEED_MAX, SPEED_MAX);

  const binding: KeyBinding = { action: value.action, value: value.value };
  if (value.code !== undefined) {
    if (value.code !== null && (typeof value.code !== 'string' || value.code.length > 128)) {
      throw new Error(`Invalid code for ${value.action}`);
    }
    binding.code = value.code;
  }
  if (value.displayKey !== undefined) {
    if (typeof value.displayKey !== 'string' || value.displayKey.length > 128) {
      throw new Error(`Invalid display key for ${value.action}`);
    }
    binding.displayKey = value.displayKey;
  }
  for (const key of ['key', 'keyCode'] as const) {
    if (value[key] !== undefined) {
      if (
        !Number.isInteger(value[key]) ||
        (value[key] as number) < 0 ||
        (value[key] as number) > 255
      ) {
        throw new Error(`Invalid ${key} for ${value.action}`);
      }
      binding[key] = value[key] as number;
    }
  }
  if (value.predefined !== undefined) {
    assertBoolean(value.predefined, `predefined flag for ${value.action}`);
    binding.predefined = value.predefined;
  }
  const modifiers = parseModifiers(value.modifiers);
  if (modifiers) {
    binding.modifiers = modifiers;
  }
  return binding;
}

function parseSiteRule(value: unknown): SiteRule {
  if (!isRecord(value) || typeof value.pattern !== 'string' || value.pattern.trim().length === 0) {
    throw new Error('Invalid site rule pattern');
  }
  if (value.pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error('Invalid site rule pattern: too long');
  }
  if (value.enabled !== undefined) {
    assertBoolean(value.enabled, `enabled flag for site rule ${value.pattern}`);
  }
  if (value.speed !== undefined && value.speed !== null) {
    assertFiniteNumber(value.speed, `speed for site rule ${value.pattern}`, SPEED_MIN, SPEED_MAX);
  }
  return {
    pattern: value.pattern,
    enabled: value.enabled === undefined ? true : value.enabled,
    speed: value.speed === undefined ? null : value.speed,
  };
}

function parseSettings(source: Record<string, unknown>): Partial<Settings> {
  const settings: Partial<Settings> = {};

  if (source.schemaVersion !== undefined) {
    if (!Number.isInteger(source.schemaVersion) || (source.schemaVersion as number) < 1) {
      throw new Error('Invalid schemaVersion');
    }
    settings.schemaVersion = source.schemaVersion as number;
  }
  if (source.lastSpeed !== undefined) {
    if (source.lastSpeed !== null) {
      assertFiniteNumber(source.lastSpeed, 'lastSpeed', SPEED_MIN, SPEED_MAX);
    }
    settings.lastSpeed = source.lastSpeed as number | null;
  }
  for (const key of [
    'enabled',
    'rememberSpeed',
    'exclusiveKeys',
    'audioBoolean',
    'startHidden',
  ] as const) {
    if (source[key] !== undefined) {
      assertBoolean(source[key], key);
      settings[key] = source[key];
    }
  }
  if (source.controllerOpacity !== undefined) {
    assertFiniteNumber(source.controllerOpacity, 'controllerOpacity', 0, 1);
    settings.controllerOpacity = source.controllerOpacity;
  }
  if (source.controllerButtonSize !== undefined) {
    assertFiniteNumber(source.controllerButtonSize, 'controllerButtonSize', 8, 48);
    settings.controllerButtonSize = source.controllerButtonSize;
  }
  if (source.controllerTheme !== undefined) {
    const controllerTheme = normalizeControllerTheme(source.controllerTheme);
    if (controllerTheme === 'default' && source.controllerTheme !== 'default') {
      throw new Error('Invalid controllerTheme');
    }
    settings.controllerTheme = controllerTheme;
  }
  if (source.customCSS !== undefined) {
    if (typeof source.customCSS !== 'string') {
      throw new Error('Invalid customCSS: expected text');
    }
    if (new Blob([source.customCSS]).size > MAX_CUSTOM_CSS_BYTES) {
      throw new Error('Invalid customCSS: exceeds the 8KB storage limit');
    }
    settings.customCSS = source.customCSS;
  }
  if (source.keyBindings !== undefined) {
    if (!Array.isArray(source.keyBindings) || source.keyBindings.length > MAX_BINDINGS) {
      throw new Error('Invalid keyBindings');
    }
    settings.keyBindings = source.keyBindings.map(parseKeyBinding);
  }
  if (source.siteRules !== undefined) {
    if (!Array.isArray(source.siteRules) || source.siteRules.length > MAX_SITE_RULES) {
      throw new Error('Invalid siteRules');
    }
    settings.siteRules = source.siteRules.map(parseSiteRule);
  }
  if (source.blacklist !== undefined) {
    if (typeof source.blacklist !== 'string' || source.blacklist.length > 8192) {
      throw new Error('Invalid blacklist');
    }
    settings.blacklist = source.blacklist;
  }
  for (const key of ['defaultLogLevel', 'logLevel'] as const) {
    if (source[key] !== undefined) {
      assertFiniteNumber(source[key], key, 1, 6);
      settings[key] = source[key];
    }
  }

  if (Object.keys(settings).length === 0) {
    throw new Error('No Video Speed Controller settings found in this file');
  }
  return settings;
}

export function createSettingsExport(settings: Settings): SettingsExport {
  const portable = Object.fromEntries(
    PORTABLE_SETTING_KEYS.map((key) => [key, clone(settings[key])])
  ) as PortableSettings;
  // Settings normally originate from the typed UI, but exports must remain
  // portable even if an older extension build left a legacy flavour-only value
  // in storage. The canonical identifier is what the picker and popup use.
  portable.controllerTheme = normalizeControllerTheme(settings.controllerTheme);
  return {
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: portable,
  };
}

/**
 * Validate a current settings export or a legacy raw settings object.
 * Unknown/private runtime values are intentionally ignored.
 */
export function parseSettingsImport(value: unknown): Partial<Settings> {
  if (!isRecord(value)) {
    throw new Error('Settings file must contain a JSON object');
  }

  if ('format' in value || 'version' in value || 'settings' in value) {
    if (value.format !== SETTINGS_EXPORT_FORMAT) {
      throw new Error('This file is not a Video Speed Controller settings export');
    }
    if (value.version !== SETTINGS_EXPORT_VERSION) {
      throw new Error(`Unsupported settings export version: ${String(value.version)}`);
    }
    if (!isRecord(value.settings)) {
      throw new Error('Settings export is missing its settings object');
    }
    return parseSettings(value.settings);
  }

  return parseSettings(value);
}
