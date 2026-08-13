/**
 * @domio/ui/tokens — typed runtime export of design tokens.
 *
 * Used by Canvas charts, video pipeline, and any non-CSS consumer
 * (Three.js materials, WebGL clear colors, canvas rendering).
 *
 * CSS consumers should reference the custom properties from
 * `./tokens.css` directly. The two sources must stay in sync.
 */

export type ThemeName = 'light' | 'dark';

export interface ColorTokens {
  readonly surface: readonly [string, string, string, string, string, string];
  readonly content: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
    readonly disabled: string;
    readonly inverse: string;
  };
  readonly accent: readonly [string, string, string, ...string[]];
  readonly status: {
    readonly success: string;
    readonly warning: string;
    readonly danger: string;
    readonly info: string;
  };
  readonly border: {
    readonly subtle: string;
    readonly default: string;
    readonly strong: string;
  };
}

export interface SpacingTokens {
  readonly 0: string;
  readonly 1: string;
  readonly 2: string;
  readonly 3: string;
  readonly 4: string;
  readonly 5: string;
  readonly 6: string;
  readonly 8: string;
  readonly 10: string;
  readonly 12: string;
  readonly 16: string;
}

export interface TypeTokens {
  readonly display: { size: string; line: string; weight: number };
  readonly heading: { size: string; line: string; weight: number };
  readonly body: { size: string; line: string; weight: number };
  readonly caption: { size: string; line: string; weight: number };
}

export interface RadiusTokens {
  readonly xs: string;
  readonly sm: string;
  readonly md: string;
  readonly lg: string;
  readonly xl: string;
  readonly full: string;
}

export interface MotionTokens {
  readonly ease: {
    readonly standard: string;
    readonly accelerate: string;
    readonly decelerate: string;
  };
  readonly duration: readonly [string, string, string, string, string];
}

interface TokensShape {
  color: {
    surface: string[];
    content: {
      primary: string;
      secondary: string;
      muted: string;
      disabled: string;
      inverse: string;
    };
    accent: string[];
    status: {
      success: string;
      warning: string;
      danger: string;
      info: string;
    };
    border: {
      subtle: string;
      default: string;
      strong: string;
    };
  };
  spacing: Record<0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16, string>;
  type: {
    display: { size: string; line: string; weight: number };
    heading: { size: string; line: string; weight: number };
    body: { size: string; line: string; weight: number };
    caption: { size: string; line: string; weight: number };
  };
  radius: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
  motion: {
    ease: { standard: string; accelerate: string; decelerate: string };
    duration: string[];
  };
}

export const lightTokens: TokensShape = {
  color: {
    surface: ['#ffffff', '#f7f8fa', '#eef0f4', '#e2e5eb', '#d3d7df', '#c2c8d2'],
    content: {
      primary: '#0a0e14',
      secondary: '#30363d',
      muted: '#6e7681',
      disabled: '#9da7b3',
      inverse: '#ffffff',
    },
    accent: ['#58a6ff', '#3b82f6', '#1d4ed8'],
    status: {
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#0284c7',
    },
    border: {
      subtle: '#e2e5eb',
      default: '#c2c8d2',
      strong: '#6e7681',
    },
  },
  spacing: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
  },
  type: {
    display: { size: '2.5rem', line: '1.15', weight: 700 },
    heading: { size: '1.5rem', line: '1.25', weight: 600 },
    body: { size: '1rem', line: '1.6', weight: 400 },
    caption: { size: '0.875rem', line: '1.4', weight: 500 },
  },
  radius: {
    xs: '2px',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  motion: {
    ease: {
      standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
      decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    },
    duration: ['80ms', '160ms', '240ms', '320ms', '480ms'],
  },
};

export const darkTokens: TokensShape = {
  ...lightTokens,
  color: {
    ...lightTokens.color,
    surface: ['#0a0e14', '#161b22', '#1f242c', '#2a313a', '#3a424d', '#4d5663'],
    content: {
      primary: '#f0f6fc',
      secondary: '#c9d1d9',
      muted: '#8b949e',
      disabled: '#484f58',
      inverse: '#0a0e14',
    },
    accent: ['#58a6ff', '#79b8ff', '#a5d6ff'],
    status: {
      success: '#3fb950',
      warning: '#d29922',
      danger: '#f85149',
      info: '#58a6ff',
    },
    border: {
      subtle: '#21262d',
      default: '#30363d',
      strong: '#8b949e',
    },
  },
};

export const tokens: Readonly<Record<ThemeName, TokensShape>> = {
  light: lightTokens,
  dark: darkTokens,
};

/** Returns the tokens for the active theme. Defaults to light. */
export function tokensFor(theme: ThemeName): TokensShape {
  return tokens[theme] ?? lightTokens;
}
