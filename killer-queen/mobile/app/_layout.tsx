import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { palettes } from '../src/ui/tokens';

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = scheme === 'light' ? palettes.light : palettes.dark;
  return (
    <>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: p.panel }, headerTintColor: p.text, contentStyle: { backgroundColor: p.bg }, headerTitleStyle: { fontWeight: '600' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
        <Stack.Screen name="market/[id]" options={{ title: 'Market' }} />
        <Stack.Screen name="kitchen-sink" options={{ title: 'Kitchen sink (dev)' }} />
      </Stack>
    </>
  );
}
