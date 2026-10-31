/** Same tokens as the web (docs/DESIGN_SYSTEM.md), as React Native values. */
import { useColorScheme } from 'react-native';

export interface Palette {
  bg: string;
  panel: string;
  panel2: string;
  line: string;
  text: string;
  muted: string;
  yes: string;
  yesBg: string;
  no: string;
  noBg: string;
  accent: string;
  accentText: string;
  warn: string;
}
export const palettes: Record<'dark' | 'light', Palette> = {
  dark: { bg: '#0b0e13', panel: '#12161d', panel2: '#181d26', line: '#232a35', text: '#e6e9ef', muted: '#8a93a3', yes: '#2fbf71', yesBg: 'rgba(47,191,113,0.14)', no: '#e4574f', noBg: 'rgba(228,87,79,0.14)', accent: '#6ea8fe', accentText: '#0b0e13', warn: '#f0b429' },
  light: { bg: '#f6f7f9', panel: '#ffffff', panel2: '#eef1f5', line: '#d9dee6', text: '#141821', muted: '#5d6676', yes: '#1f9d5a', yesBg: 'rgba(31,157,90,0.12)', no: '#c9403a', noBg: 'rgba(201,64,58,0.12)', accent: '#2f6fe4', accentText: '#ffffff', warn: '#b7780a' },
};

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24 } as const;
export const radius = { r1: 4, r2: 6, r3: 10 } as const;
export const type = {
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  big: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  mono: { fontFamily: 'Menlo', fontSize: 13, lineHeight: 18 },
  /** Prices and balances: tabular numerals so columns stay aligned. */
  num: { fontVariant: ['tabular-nums'] as ('tabular-nums')[], fontFamily: 'Menlo' },
};

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'light' ? palettes.light : palettes.dark;
}
