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
  dark: { bg: '#0b0d11', panel: '#141821', panel2: '#1b2029', line: '#252b36', text: '#e9ecf2', muted: '#8b93a7', yes: '#2ebd6b', yesBg: 'rgba(46,189,107,0.12)', no: '#ef5a52', noBg: 'rgba(239,90,82,0.12)', accent: '#7aa2ff', accentText: '#0b0d11', warn: '#f2b02d' },
  light: { bg: '#f6f7f9', panel: '#ffffff', panel2: '#f3f5f8', line: '#e4e7ed', text: '#121622', muted: '#5f6878', yes: '#1f9d58', yesBg: 'rgba(31,157,88,0.10)', no: '#d8463f', noBg: 'rgba(216,70,63,0.10)', accent: '#2f63e9', accentText: '#ffffff', warn: '#b7780a' },
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
  /** Prices and balances: the body face with tabular numerals, so columns stay aligned without going monospace. */
  num: { fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
};

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'light' ? palettes.light : palettes.dark;
}
