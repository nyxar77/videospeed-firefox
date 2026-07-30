import { describe, expect, it } from 'vitest';
import {
  applyThemeToDocument,
  CONTROLLER_THEMES,
  getControllerThemeCSS,
  isControllerTheme,
  normalizeControllerTheme,
} from '../../../src/ui/controller-themes.ts';

describe('controller themes', () => {
  it('exposes the default theme and every Catppuccin variant', () => {
    expect(CONTROLLER_THEMES).toHaveLength(58);
    expect(CONTROLLER_THEMES).toContain('default');
    expect(CONTROLLER_THEMES).toContain('custom');
    expect(CONTROLLER_THEMES).toContain('catppuccin-latte-red');
    expect(CONTROLLER_THEMES).toContain('catppuccin-mocha-lavender');
  });

  it('returns no override CSS for the default theme', () => {
    expect(getControllerThemeCSS('default')).toBe('');
  });

  it('generates readable Mocha styling for the controller internals', () => {
    const css = getControllerThemeCSS('catppuccin-mocha-red');

    expect(css).toContain('#controller');
    expect(css).toContain('#1e1e2e');
    expect(css).toContain('#f38ba8');
    expect(css).toContain('button:hover');
  });

  it('accepts only supported theme identifiers', () => {
    expect(isControllerTheme('catppuccin-latte-red')).toBe(true);
    expect(isControllerTheme('catppuccin-mocha-red')).toBe(true);
    expect(isControllerTheme('neon')).toBe(false);
    expect(isControllerTheme(null)).toBe(false);
    expect(normalizeControllerTheme('catppuccin-mocha')).toBe('catppuccin-mocha-red');
  });

  it('applies and replaces the palette inside the controller shadow root', () => {
    const wrapper = document.createElement('vsc-controller');
    document.body.appendChild(wrapper);

    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper, {
      theme: 'catppuccin-latte-red',
    });
    const themeStyle = shadow.querySelector('style[data-vsc-theme]');
    expect(themeStyle?.textContent).toContain('#eff1f5');

    window.VSC.ShadowDOMManager.setTheme(shadow, 'catppuccin-mocha-red');
    expect(themeStyle?.textContent).toContain('#1e1e2e');
    expect(themeStyle?.textContent).toContain('#f38ba8');

    wrapper.remove();
  });

  it('updates opacity and button size inside an existing shadow root', () => {
    const wrapper = document.createElement('vsc-controller');
    document.body.appendChild(wrapper);
    const shadow = window.VSC.ShadowDOMManager.createShadowDOM(wrapper);

    window.VSC.ShadowDOMManager.setAppearance(shadow, { opacity: 0.85, buttonSize: 19 });

    expect(shadow.querySelector('#controller')?.style.opacity).toBe('0.85');
    expect(shadow.querySelector('.draggable')?.style.fontSize).toBe('19px');
    expect(shadow.querySelector('#controls')?.style.lineHeight).toBe('19px');
    wrapper.remove();
  });

  it('applies a palette to extension document variables', () => {
    applyThemeToDocument(document, 'catppuccin-frappe-blue');
    expect(document.documentElement.style.getPropertyValue('--md-surface')).toBe('#303446');
    expect(document.documentElement.style.getPropertyValue('--md-primary')).toBe('#8caaee');
    applyThemeToDocument(document, 'default');
    expect(document.documentElement.style.getPropertyValue('--md-primary')).toBe('');
  });
});
