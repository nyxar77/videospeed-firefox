export const CONTROLLER_THEMES = [
  'default',
  'catppuccin-latte',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha',
] as const;

export type ControllerTheme = (typeof CONTROLLER_THEMES)[number];

interface ThemePalette {
  base: string;
  mantle: string;
  surface: string;
  text: string;
  subtext: string;
  accent: string;
  accentText: string;
}

const CATPPUCCIN_PALETTES: Record<Exclude<ControllerTheme, 'default'>, ThemePalette> = {
  'catppuccin-latte': {
    base: '#eff1f5',
    mantle: '#e6e9ef',
    surface: '#ccd0da',
    text: '#4c4f69',
    subtext: '#6c6f85',
    accent: '#d20f39',
    accentText: '#eff1f5',
  },
  'catppuccin-frappe': {
    base: '#303446',
    mantle: '#292c3c',
    surface: '#414559',
    text: '#c6d0f5',
    subtext: '#a5adce',
    accent: '#e78284',
    accentText: '#303446',
  },
  'catppuccin-macchiato': {
    base: '#24273a',
    mantle: '#1e2030',
    surface: '#363a4f',
    text: '#cad3f5',
    subtext: '#a5adcb',
    accent: '#ed8796',
    accentText: '#24273a',
  },
  'catppuccin-mocha': {
    base: '#1e1e2e',
    mantle: '#181825',
    surface: '#313244',
    text: '#cdd6f4',
    subtext: '#a6adc8',
    accent: '#f38ba8',
    accentText: '#1e1e2e',
  },
};

export function isControllerTheme(value: unknown): value is ControllerTheme {
  return typeof value === 'string' && CONTROLLER_THEMES.includes(value as ControllerTheme);
}

export function getControllerThemeCSS(theme: ControllerTheme): string {
  if (theme === 'default') {
    return '';
  }

  const palette = CATPPUCCIN_PALETTES[theme];
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
