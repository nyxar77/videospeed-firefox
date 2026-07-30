import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_THEMES,
  getControllerThemeCSS,
  isControllerTheme,
} from '../../../src/ui/controller-themes.ts';

describe('controller themes', () => {
  it('exposes the default theme and every Catppuccin variant', () => {
    expect(CONTROLLER_THEMES).toEqual([
      'default',
      'catppuccin-latte',
      'catppuccin-frappe',
      'catppuccin-macchiato',
      'catppuccin-mocha',
    ]);
  });

  it('returns no override CSS for the default theme', () => {
    expect(getControllerThemeCSS('default')).toBe('');
  });

  it('generates readable Mocha styling for the controller internals', () => {
    const css = getControllerThemeCSS('catppuccin-mocha');

    expect(css).toContain('#controller');
    expect(css).toContain('#1e1e2e');
    expect(css).toContain('#f38ba8');
    expect(css).toContain('button:hover');
  });

  it('accepts only supported theme identifiers', () => {
    expect(isControllerTheme('catppuccin-latte')).toBe(true);
    expect(isControllerTheme('catppuccin-mocha')).toBe(true);
    expect(isControllerTheme('neon')).toBe(false);
    expect(isControllerTheme(null)).toBe(false);
  });

  it('applies and replaces the palette inside the controller shadow root', () => {
    const wrapper = document.createElement('vsc-controller');
    document.body.appendChild(wrapper);

    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, {
      theme: 'catppuccin-latte',
    });
    const themeStyle = shadow.querySelector('style[data-vsc-theme]');
    expect(themeStyle?.textContent).toContain('#eff1f5');

    window.VSC.ShadowDOMManager.setTheme(shadow, 'catppuccin-mocha');
    expect(themeStyle?.textContent).toContain('#1e1e2e');
    expect(themeStyle?.textContent).toContain('#f38ba8');

    wrapper.remove();
  });
});
