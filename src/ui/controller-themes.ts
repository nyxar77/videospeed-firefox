export const CATPPUCCIN_FLAVORS = ['latte', 'frappe', 'macchiato', 'mocha'] as const;
export const CATPPUCCIN_ACCENTS = [
  'rosewater',
  'flamingo',
  'pink',
  'mauve',
  'red',
  'maroon',
  'peach',
  'yellow',
  'green',
  'teal',
  'sky',
  'sapphire',
  'blue',
  'lavender',
] as const;

export type CatppuccinFlavor = (typeof CATPPUCCIN_FLAVORS)[number];
export type CatppuccinAccent = (typeof CATPPUCCIN_ACCENTS)[number];
export type ControllerTheme =
  | 'default'
  | 'custom'
  | `catppuccin-${CatppuccinFlavor}-${CatppuccinAccent}`;

export const CONTROLLER_THEMES: readonly ControllerTheme[] = [
  'default',
  ...CATPPUCCIN_FLAVORS.flatMap((flavor) =>
    CATPPUCCIN_ACCENTS.map((accent) => `catppuccin-${flavor}-${accent}` as ControllerTheme)
  ),
  'custom',
];

interface ThemePalette {
  base: string;
  mantle: string;
  surface: string;
  text: string;
  subtext: string;
  accent: string;
  accentText: string;
}

interface FlavorPalette extends Omit<ThemePalette, 'accent' | 'accentText'> {
  accents: Record<CatppuccinAccent, string>;
}

// Catppuccin palette v1.8.0. Accent values come directly from the official palette.
const CATPPUCCIN_PALETTES: Record<CatppuccinFlavor, FlavorPalette> = {
  latte: {
    base: '#eff1f5',
    mantle: '#e6e9ef',
    surface: '#ccd0da',
    text: '#4c4f69',
    subtext: '#6c6f85',
    accents: {
      rosewater: '#dc8a78',
      flamingo: '#dd7878',
      pink: '#ea76cb',
      mauve: '#8839ef',
      red: '#d20f39',
      maroon: '#e64553',
      peach: '#fe640b',
      yellow: '#df8e1d',
      green: '#40a02b',
      teal: '#179299',
      sky: '#04a5e5',
      sapphire: '#209fb5',
      blue: '#1e66f5',
      lavender: '#7287fd',
    },
  },
  frappe: {
    base: '#303446',
    mantle: '#292c3c',
    surface: '#414559',
    text: '#c6d0f5',
    subtext: '#a5adce',
    accents: {
      rosewater: '#f2d5cf',
      flamingo: '#eebebe',
      pink: '#f4b8e4',
      mauve: '#ca9ee6',
      red: '#e78284',
      maroon: '#ea999c',
      peach: '#ef9f76',
      yellow: '#e5c890',
      green: '#a6d189',
      teal: '#81c8be',
      sky: '#99d1db',
      sapphire: '#85c1dc',
      blue: '#8caaee',
      lavender: '#babbf1',
    },
  },
  macchiato: {
    base: '#24273a',
    mantle: '#1e2030',
    surface: '#363a4f',
    text: '#cad3f5',
    subtext: '#a5adcb',
    accents: {
      rosewater: '#f4dbd6',
      flamingo: '#f0c6c6',
      pink: '#f5bde6',
      mauve: '#c6a0f6',
      red: '#ed8796',
      maroon: '#ee99a0',
      peach: '#f5a97f',
      yellow: '#eed49f',
      green: '#a6da95',
      teal: '#8bd5ca',
      sky: '#91d7e3',
      sapphire: '#7dc4e4',
      blue: '#8aadf4',
      lavender: '#b7bdf8',
    },
  },
  mocha: {
    base: '#1e1e2e',
    mantle: '#181825',
    surface: '#313244',
    text: '#cdd6f4',
    subtext: '#a6adc8',
    accents: {
      rosewater: '#f5e0dc',
      flamingo: '#f2cdcd',
      pink: '#f5c2e7',
      mauve: '#cba6f7',
      red: '#f38ba8',
      maroon: '#eba0ac',
      peach: '#fab387',
      yellow: '#f9e2af',
      green: '#a6e3a1',
      teal: '#94e2d5',
      sky: '#89dceb',
      sapphire: '#74c7ec',
      blue: '#89b4fa',
      lavender: '#b4befe',
    },
  },
};

const UI_THEME_VARIABLES = [
  '--md-surface',
  '--md-surface-variant',
  '--md-surface-container',
  '--md-on-surface',
  '--md-on-surface-variant',
  '--md-primary',
  '--md-primary-container',
  '--md-on-primary',
  '--md-on-primary-container',
  '--md-outline',
  '--md-outline-variant',
  '--power-enabled',
  '--power-enabled-bg',
] as const;

function getThemeParts(theme: ControllerTheme): [CatppuccinFlavor, CatppuccinAccent] | null {
  if (!theme.startsWith('catppuccin-')) {
    return null;
  }
  const [, flavor, accent] = theme.split('-');
  if (
    !CATPPUCCIN_FLAVORS.includes(flavor as CatppuccinFlavor) ||
    !CATPPUCCIN_ACCENTS.includes(accent as CatppuccinAccent)
  ) {
    return null;
  }
  return [flavor as CatppuccinFlavor, accent as CatppuccinAccent];
}

function getThemePalette(theme: ControllerTheme): ThemePalette | null {
  const parts = getThemeParts(theme);
  if (!parts) {
    return null;
  }
  const [flavor, accent] = parts;
  const palette = CATPPUCCIN_PALETTES[flavor];
  return {
    ...palette,
    accent: palette.accents[accent],
    // The flavour base keeps hover text legible on Catppuccin accent colors.
    accentText: palette.base,
  };
}

export function isControllerTheme(value: unknown): value is ControllerTheme {
  return typeof value === 'string' && CONTROLLER_THEMES.includes(value as ControllerTheme);
}

/** Preserve the original flavour-only presets as their red accent equivalent. */
export function normalizeControllerTheme(value: unknown): ControllerTheme {
  if (isControllerTheme(value)) {
    return value;
  }
  if (typeof value === 'string' && /^catppuccin-(latte|frappe|macchiato|mocha)$/.test(value)) {
    return `${value}-red` as ControllerTheme;
  }
  return 'default';
}

export function getControllerThemeLabel(theme: ControllerTheme): string {
  if (theme === 'default') {
    return 'Default';
  }
  if (theme === 'custom') {
    return 'Custom CSS';
  }
  const [flavor, accent] = getThemeParts(theme) as [CatppuccinFlavor, CatppuccinAccent];
  return `${flavor[0].toUpperCase()}${flavor.slice(1)} ${accent[0].toUpperCase()}${accent.slice(1)}`;
}

/** Return the accent color for a picker swatch, if this is a Catppuccin theme. */
export function getControllerThemeAccentColor(theme: ControllerTheme): string | null {
  const parts = getThemeParts(theme);
  if (!parts) {
    return null;
  }
  const [flavor, accent] = parts;
  return CATPPUCCIN_PALETTES[flavor].accents[accent];
}

export function getControllerThemeCSS(theme: ControllerTheme): string {
  const palette = getThemePalette(theme);
  if (!palette) {
    return '';
  }

  return `
    #controller {
      background: ${palette.base};
      color: ${palette.text};
      border: 1px solid ${palette.accent};
      box-shadow: 0 3px 14px ${palette.mantle};
    }

    .draggable {
      color: ${palette.text};
      font-weight: 700;
      text-shadow: 0 1px 0 ${palette.mantle};
    }

    button {
      background: ${palette.surface};
      border: 1px solid ${palette.subtext};
      color: ${palette.text};
    }

    button:hover,
    button:focus-visible {
      background: ${palette.accent};
      border-color: ${palette.accent};
      color: ${palette.accentText};
    }

    button:active {
      background: ${palette.mantle};
      border-color: ${palette.accent};
      color: ${palette.accent};
    }
  `;
}

/** Apply the selected Catppuccin flavour to a regular extension document. */
export function applyThemeToDocument(document: Document, theme: unknown): void {
  const root = document.documentElement;
  const resolvedTheme = normalizeControllerTheme(theme);
  const palette = getThemePalette(resolvedTheme);

  for (const variable of UI_THEME_VARIABLES) {
    root.style.removeProperty(variable);
  }
  root.dataset.vscTheme = resolvedTheme;

  if (!palette) {
    return;
  }

  root.style.setProperty('--md-surface', palette.base);
  root.style.setProperty('--md-surface-variant', palette.surface);
  root.style.setProperty('--md-surface-container', palette.mantle);
  root.style.setProperty('--md-on-surface', palette.text);
  root.style.setProperty('--md-on-surface-variant', palette.subtext);
  root.style.setProperty('--md-primary', palette.accent);
  root.style.setProperty('--md-primary-container', palette.surface);
  root.style.setProperty('--md-on-primary', palette.accentText);
  root.style.setProperty('--md-on-primary-container', palette.text);
  root.style.setProperty('--md-outline', palette.subtext);
  root.style.setProperty('--md-outline-variant', palette.surface);
  root.style.setProperty('--power-enabled', palette.accent);
  root.style.setProperty(
    '--power-enabled-bg',
    `color-mix(in srgb, ${palette.accent} 14%, transparent)`
  );
}
