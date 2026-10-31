import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { usePalette } from '../../src/ui/tokens';

const icon =
  (glyph: string) =>
  ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden importantForAccessibility="no">
      {glyph}
    </Text>
  );

export default function TabLayout() {
  const p = usePalette();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: p.accent, tabBarInactiveTintColor: p.muted, tabBarStyle: { backgroundColor: p.panel, borderTopColor: p.line }, headerStyle: { backgroundColor: p.panel }, headerTintColor: p.text, sceneStyle: { backgroundColor: p.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Markets', tabBarIcon: icon('▤') }} />
      <Tabs.Screen name="portfolio" options={{ title: 'Portfolio', tabBarIcon: icon('◫') }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard', tabBarIcon: icon('▲') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('●') }} />
    </Tabs>
  );
}
