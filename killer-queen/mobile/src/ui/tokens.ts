/** The web tokens (docs/DESIGN_SYSTEM.md, src/web/styles/tokens.css) as React Native values. Same names, same hex. */
import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';
import { useColorScheme } from 'react-native';

export interface Palette {
  canvas: string;
  surface: string;
  surfaceSunken: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  ruleStrong: string;
  yes: string;
  yesTint: string;
  no: string;
  noTint: string;
  warn: string;
  warnTint: string;
  focus: string;
  onInk: string;
}

export const palettes: Record<'light' | 'dark', Palette> = {
  light: { canvas: '#F1F3F6', surface: '#FFFFFF', surfaceSunken: '#E9ECF1', ink: '#15181E', ink2: '#4A5261', ink3: '#5F6878', rule: '#DDE1E8', ruleStrong: '#C3C9D3', yes: '#007A50', yesTint: '#E3F5EE', no: '#B81F55', noTint: '#FBE7EE', warn: '#9E5300', warnTint: '#FFF1DD', focus: '#2F6BFF', onInk: '#FFFFFF' },
  dark: { canvas: '#0E1116', surface: '#161A21', surfaceSunken: '#1D222B', ink: '#E8EBF0', ink2: '#A9B1BE', ink3: '#8590A0', rule: '#2A303A', ruleStrong: '#3A414D', yes: '#2FC28A', yesTint: '#10261E', no: '#FF5C8F', noTint: '#2B1520', warn: '#F0A23B', warnTint: '#2A1D0B', focus: '#6E9BFF', onInk: '#0E1116' },
};

/** Font family names as registered by expo-font from the @expo-google-fonts packages. */
export const font = {
  sans400: 'IBMPlexSans_400Regular',
  sans500: 'IBMPlexSans_500Medium',
  sans600: 'IBMPlexSans_600SemiBold',
  cond600: 'IBMPlexSansCondensed_600SemiBold',
  mono400: 'IBMPlexMono_400Regular',
} as const;

/** Type scale: size / line height, with the family. Numerals are tabular through fontVariant. */
export const type = {
  caption: { fontFamily: font.sans400, fontSize: 12, lineHeight: 16 },
  dense: { fontFamily: font.sans400, fontSize: 13, lineHeight: 18 },
  ui: { fontFamily: font.sans400, fontSize: 14, lineHeight: 20 },
  uiMedium: { fontFamily: font.sans500, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: font.sans400, fontSize: 16, lineHeight: 24 },
  h3: { fontFamily: font.sans600, fontSize: 20, lineHeight: 26 },
  h2: { fontFamily: font.sans600, fontSize: 24, lineHeight: 30, letterSpacing: -0.24 },
  h1: { fontFamily: font.sans600, fontSize: 32, lineHeight: 36, letterSpacing: -0.32 },
  numM: { fontFamily: font.cond600, fontSize: 20, lineHeight: 24, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  numL: { fontFamily: font.cond600, fontSize: 44, lineHeight: 44, letterSpacing: -0.44, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  numXl: { fontFamily: font.cond600, fontSize: 72, lineHeight: 72, letterSpacing: -0.72, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  mono: { fontFamily: font.mono400, fontSize: 13, lineHeight: 18 },
  num: { fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
} as const;

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s6: 24, s8: 32, s12: 48, s16: 64 } as const;
export const radius = { control: 4, panel: 8, round: 999 } as const;
export const size = { control: 44, icon: 20, touch: 44, sideCol: 320 } as const;
export const shadowFloat = { shadowColor: '#101828', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 } as const;

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? palettes.dark : palettes.light;
}

/** Reduce Motion from the OS; animations show their final state when it is on. */
export function useReduceMotion(): boolean {
  return useReanimatedReducedMotion();
}
