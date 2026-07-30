import { describe, expect, it } from 'vitest';
import {
  createSettingsExport,
  parseSettingsImport,
  SETTINGS_EXPORT_FORMAT,
  SETTINGS_EXPORT_VERSION,
} from '../../../src/utils/settings-transfer.ts';
import type { Settings } from '../../../src/types/settings.ts';

function settingsFixture(): Settings {
  return {
    schemaVersion: 2,
    lastSpeed: 1.75,
    enabled: true,
    rememberSpeed: true,
    exclusiveKeys: true,
    audioBoolean: true,
    startHidden: false,
    controllerOpacity: 0.8,
    controllerButtonSize: 16,
    controllerTheme: 'catppuccin-mocha',
    customCSS: 'vsc-controller { filter: none; }',
    keyBindings: [
      { action: 'faster', code: 'KeyD', key: 68, keyCode: 68, displayKey: 'd', value: 0.2 },
    ],
    siteRules: [{ pattern: 'youtube.com', enabled: true, speed: 1.5 }],
    blacklist: 'example.com',
    defaultLogLevel: 4,
    logLevel: 5,
  };
}

describe('settings transfer', () => {
  it('exports every durable user setting in a versioned envelope', () => {
    const exported = createSettingsExport(settingsFixture());

    expect(exported.format).toBe(SETTINGS_EXPORT_FORMAT);
    expect(exported.version).toBe(SETTINGS_EXPORT_VERSION);
    expect(exported.settings.controllerTheme).toBe('catppuccin-mocha');
    expect(exported.settings.customCSS).toContain('filter');
    expect(exported.settings.siteRules).toEqual([
      { pattern: 'youtube.com', enabled: true, speed: 1.5 },
    ]);
    expect(exported.settings.keyBindings[0].code).toBe('KeyD');
    expect(exported.settings).toMatchObject({
      enabled: true,
      rememberSpeed: true,
      exclusiveKeys: true,
      audioBoolean: true,
      startHidden: false,
      controllerOpacity: 0.8,
      controllerButtonSize: 16,
      blacklist: 'example.com',
      defaultLogLevel: 4,
      logLevel: 5,
    });
  });

  it('round-trips settings without private runtime fields', () => {
    const imported = parseSettingsImport(createSettingsExport(settingsFixture()));

    expect(imported.controllerTheme).toBe('catppuccin-mocha');
    expect(imported.keyBindings).toEqual(settingsFixture().keyBindings);
    expect(imported.siteRules).toEqual(settingsFixture().siteRules);
    expect('_abort' in imported).toBe(false);
  });

  it('exports a snapshot rather than references to live settings', () => {
    const settings = settingsFixture();
    const exported = createSettingsExport(settings);

    settings.keyBindings[0].value = 9;
    settings.siteRules[0].pattern = 'changed.example';

    expect(exported.settings.keyBindings[0].value).toBe(0.2);
    expect(exported.settings.siteRules[0].pattern).toBe('youtube.com');
  });

  it('accepts legacy raw settings exports', () => {
    const imported = parseSettingsImport({
      rememberSpeed: true,
      keyBindings: [{ action: 'faster', value: 0.1 }],
      siteRules: [{ pattern: 'youtube.com', enabled: true, speed: null }],
    });

    expect(imported.rememberSpeed).toBe(true);
    expect(imported.keyBindings).toHaveLength(1);
    expect(imported.siteRules).toHaveLength(1);
  });

  it('rejects malformed or unsafe imports before storage is touched', () => {
    expect(() => parseSettingsImport({ format: SETTINGS_EXPORT_FORMAT, version: 99 })).toThrow(
      'Unsupported settings export version'
    );
    expect(() => parseSettingsImport({ keyBindings: [{ action: 'faster', value: 99 }] })).toThrow(
      'between -16 and 16'
    );
    expect(() =>
      parseSettingsImport({
        keyBindings: [{ action: 'faster', value: 0.1 }],
        controllerTheme: 'untrusted-theme',
      })
    ).toThrow('Invalid controllerTheme');
  });
});
