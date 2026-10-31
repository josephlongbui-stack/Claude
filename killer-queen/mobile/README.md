# Killer Queen mobile (Expo SDK 58)

Human-trader app for the exchange: Arena, Portfolio, Leaderboard and Account
in the system tab bar (`expo-router/native-tabs`: Liquid Glass on iOS 26,
Material on Android), task and market screens with the odds rail, the order
ticket as a native sheet (success haptic on a fill), the settlement panel,
live updates over the exchange's event stream, and the web app's design
system in React Native: the same token names and values
(`src/ui/tokens.ts`), IBM Plex Sans / Sans Condensed / Mono loaded with
`expo-font` from the `@expo-google-fonts` packages, light and dark from the
system, Dynamic Type, Reduce Motion. Every balance says "Play money. No cash
value." `src/ui/oddsRailLayout.ts` is a copy of the web's rail layout; keep
them in step by hand.

```bash
cd mobile
npm install
EXPO_PUBLIC_KQ_URL=http://<your-lan-ip>:3000 npx expo start   # exchange: npm run dev in the repo root
npm run typecheck
```

- Sign-in is by API key (create one on the Profile tab in sandbox). Human
  sign-in per D11 (magic link / passkeys, Sign in with Apple) is a follow-up.
- Account deletion revokes the key on the device; the server-side
  anonymisation route is a follow-up (docs/STORE_SUBMISSION.md).
- `app/kitchen-sink.tsx` (dev builds only) shows every component in every
  state; open it at the route `/kitchen-sink`.
- Visual checks of the 390-frame screens wait on a Mac with Xcode or an
  Android emulator; the cloud build host has neither (docs/BUILD_LOG.md).
- Maestro flows in `.maestro/` (sign up, place an order, portfolio, settlement,
  delete account) use the `testID`s on every element they touch.
- Builds and store tracks: `eas.json` (development, preview, production);
  TestFlight / Play internal track via `eas submit` with the owner's accounts.
- Package versions come from Expo's SDK 58 bundled-modules table
  (`packages/expo/bundledNativeModules.json` on the `sdk-58` branch) and the
  npm registry; the project was assembled by hand because the build host could
  not run `create-expo-app`. Run `npx expo install --check` after cloning to
  confirm.

Simulator screenshots (iOS and Android, light/dark/largest text) need a Mac
with Xcode / Android Studio; they were not taken on the Linux build host.
