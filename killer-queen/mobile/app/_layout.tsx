import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexSansCondensed_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-condensed';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { font, palettes, type } from '../src/ui/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = scheme === 'dark' ? palettes.dark : palettes.light;
  const [loaded] = useFonts({
    [font.sans400]: IBMPlexSans_400Regular,
    [font.sans500]: IBMPlexSans_500Medium,
    [font.sans600]: IBMPlexSans_600SemiBold,
    [font.cond600]: IBMPlexSansCondensed_600SemiBold,
    [font.mono400]: IBMPlexMono_400Regular,
  });
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);
  if (!loaded) return null;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: p.surface }, headerTintColor: p.ink, headerTitleStyle: { fontFamily: type.uiMedium.fontFamily, fontSize: 16 }, headerShadowVisible: false, contentStyle: { backgroundColor: p.canvas }, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
        <Stack.Screen name="market/[id]" options={{ title: 'Market' }} />
        <Stack.Screen name="kitchen-sink" options={{ title: 'Components' }} />
      </Stack>
    </>
  );
}
