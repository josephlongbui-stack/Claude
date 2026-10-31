# Store submission checklist (App Store and Google Play)

What the mobile app must satisfy before either store sees it, and where each
item lives in the code. Nothing here has been submitted; the owner's developer
accounts are required for every submission step.

## Product rules the reviewer will test

| Rule | Where | Status |
| --- | --- | --- |
| Every balance says "Play money · no cash value"; nothing is bought with real money; no prizes | `mobile/src/ui/PlayMoney.tsx` shown next to every balance and position; no in-app purchases; no withdrawal | code |
| No path from play money to anything of value | the exchange has no transfer, redeem or purchase route (AGENTS.md rule 8); leaderboard rank is the only outcome | code + policy |
| Theses (user-generated content) are moderated | report button on every thesis (`POST /api/markets/:id/comments` …`/report` is v1 follow-up; today: the admin flags the account with `reviewAccount`, flagged accounts leave the leaderboard), block list stored per device, published contact `abuse@` in the app's About screen | partial: report/block UI in app; server-side report endpoint is a follow-up |
| In-app account deletion | Profile → Delete account: anonymises the account name, revokes the key (server route `POST /api/me/delete` is a follow-up; the app clears the key locally today) | partial |
| Consent before task content goes to a third-party AI | only the exchange's house LLM traders (server-side) read packets, and only public tasks; the app itself sends nothing to any AI; consent copy on the Submit screen | code (web); mobile has no submit screen in v0 |
| Age rating | 17+/Mature: simulated gambling (play-money prediction markets), no real money; answer "Simulated gambling: frequent" on both stores | docs |
| Privacy labels / Play data safety | Collected: account name (user content), email hash and device id hash (identity limits), trading activity (app functionality); none shared with third parties; no tracking; no advertising SDK | derived from `src/server/app.ts` `POST /api/accounts` and the SDK calls below |
| SDKs that send data | the app uses only `fetch` to the exchange, Expo core modules (no analytics), Sentry for crash reports (opt-in toggle in Profile; `SENTRY_DSN` off by default) | docs |
| Review notes | "Play-money exchange for forecasting whether AI coding agents pass tests; no real money, no purchases, no prizes. Demo account: see below." | docs |
| Reviewer demo account | seed script creates `review-trader` with $1,000 play money and prints its key; paste the key into the review notes | `scripts/seed.ts --review` (follow-up flag) |
| Sign in with Apple if Google sign-in is offered | neither is offered in v0 (API key sign-in); when D11 lands, add both | policy |

## Data the app sends (for privacy answers)

- `POST /api/accounts`: name, kind, role, org; optional email (hashed server-side) and a device id header (hashed).
- `POST /api/orders`, `DELETE /api/orders/:id`, `POST /api/markets/:id/comments`: trading activity and theses (public).
- `GET` routes: no data beyond the API key header.
- Nothing is sent anywhere else.

## Submission steps (owner)

1. Apple Developer Program and Google Play Console accounts; bundle id
   `dev.killerqueen.app` (change in `mobile/app.json`).
2. `eas build --profile production --platform all`; `eas submit` to TestFlight
   and the Play internal track (`mobile/eas.json`).
3. Fill the privacy questionnaire from the table above; attach the review
   notes and the demo key.
4. Trademark search on "Killer Queen" before any public listing (D10).
