# RideOps AI — Ride Safety & Operations Intelligence (Simulation MVP)

> **SIMULATION — NOT CERTIFIED FOR RIDE SAFETY OR DISPATCH CONTROL.**
> Every camera image, detection, confidence score, restraint observation, sensor reading, equipment measurement, staffing metric and financial figure in this application is synthetic and generated from seeded scripts. Nothing here connects to a ride controller, sends a dispatch command, or certifies a rider as safe. Green means "no issue flagged in simulation", amber means "human review required", red means "simulated concern". No status authorises real-world dispatch.

RideOps AI is an interactive demonstrator for a B2B platform that would use fixed station cameras, optional read-only sensor adapters and operational analytics to help ride operators at amusement parks and waterparks identify potential boarding issues for human review, improve dispatch efficiency, reduce downtime and keep records of operator reviews. The product is designed to assist staff, never to replace certified ride safety systems or required human checks.

## Hosted demo

`npm run build:single` packages the whole demo into one self-contained HTML file (CSS and JS inlined, in-memory routing), suitable for hosts that serve a single page such as a claude.ai artifact. Inside the claude.ai viewer, exports go through the viewer's download confirmation; everywhere else they are normal browser downloads.

The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) runs lint, unit tests and the production build on every pull request. On pushes to the default branch it also publishes the app to GitHub Pages at **https://josephlongbui-stack.github.io/Claude/**. Pages must be enabled once under *Settings → Pages → Source: GitHub Actions*. Deep links work on Pages because the build also ships `404.html` as a copy of `index.html`.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. No API keys, databases, cloud services or GPU are required; the demo runs entirely in the browser and keeps demo state in `localStorage`.

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest unit tests for the domain logic (evaluator, fusion, review workflow, hash chain, dispatch math, boarding allocator, scenario engine) |
| `npm run test:e2e` | Playwright end-to-end flows (starts the dev server itself) |
| `npm run lint` | ESLint (TypeScript + React hooks) |

## Five-minute demonstration walkthrough

1. **Park Overview** — fleet tiles, attraction table, occupancy trend. Click **Vortex Run** to open its monitor.
2. **Live Ride Monitor** — press **Start Guided Demo** in the top bar. Scenario A runs a normal cycle on the 24-seat train: watch the four camera views, the seat map and the observation timeline move together.
3. Scenario B stages a restraint-position observation on Row 4 Seat 2: the overlay, seat map, alert queue and event log all flag it, and the scripted operator records a review. Click the seat to open the inspector.
4. Scenario C (loose object) and D (occluded camera → *Unknown — review required*) show that nothing is ever assumed nominal. Use the **Conservative uncertainty handling** panel to inject occlusion or low confidence yourself.
5. Scenario E injects a fictional sensor record that disagrees with the camera; the **Simulated sensor fusion** panel routes it to human review.
6. Scenario F records a slow gate; open **Dispatch Analytics** to see the longer cycle, the baseline-vs-assisted simulator and the pacing agent.
7. Scenario G jumps to **Smart Boarding**: click **Generate Better Assignment** and drag a party onto a row.
8. Scenario H opens the **Water Slide Monitor**: two synchronized cameras, slide schematic, a staged exit-zone occupancy and the review that closes it.
9. Scenario I switches to the infrared dark ride; Scenario J surfaces the Gate B maintenance ticket in **Predictive Maintenance**, where you can inspect the trend and close the ticket.
10. Finish in **Evidence & Reports**: filter the hash-chained log, verify the chain, tamper with a record to see detection, and export JSON/CSV. **Reset Demo** restores the starting state and the guided demo replays identically.

## What is real software and what is simulated

**Genuinely implemented:** routing and shell, the deterministic scenario engine, the conservative observation evaluator (confidence thresholds, multi-frame stabilisation, occlusion → unknown, no affirmative state on insufficient data), the simulated-sensor fusion rules, the human review workflow and state machine, the SHA-256 hash-chained event log with verification and tamper demonstration (Web Crypto), client-side JSON/CSV export, the boarding allocator, dispatch/throughput math with block-limited behaviour, the pacing forecast, maintenance trend fitting, ROI arithmetic, the calibration region editor with saved presets, reviewer label storage, and all eleven ride configurations.

**Simulated:** every camera frame (schematic Canvas renderings of scripted observations), every detection box, confidence score, pose marker, restraint/posture/loose-object observation, every sensor reading, equipment health score and anomaly, every shift/training metric, and the model-evaluation metrics. The synthetic operating day used by the analytics pages is generated from a seeded random source.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the simulation architecture, the future-integration diagram and what remains unimplemented.

## Repository layout

```
src/
  app/            shell, sidebar navigation, routes
  components/     UI primitives, demo controls, simulation banner
  domain/
    types.ts      shared domain types (all simulation)
    rides/        RideConfiguration model, seat helpers, 11 attractions, 2 parks
    simulation/   seeded RNG, clock, scenario scripts A–L, SimulationEngine
    observation/  ObservationProvider seam, simulated provider, evaluator, fusion
    review/       alert state machine
    evidence/     hash chain (SHA-256), exports
    analytics/    dispatch, boarding, pacing, maintenance, ROI
    __tests__/    Vitest suites
  store/          Zustand stores (simulation, records, settings, boarding, maintenance, training)
  features/       monitor (cameras, seat map, inspector, alerts…), slide, config
  pages/          one component per sidebar entry
  data/           synthetic datasets (history, maintenance, training samples)
e2e/              Playwright flows
docs/             plan and architecture notes
```

## Validation required before any real pilot

Engineering: a separately engineered and validated computer-vision service behind the `ObservationProvider` seam, real camera calibration, latency and availability measurements, edge-node hardening, data retention and privacy controls, and a full test programme on recorded station footage with ground truth.

Safety: a hazard analysis establishing that the system is advisory only, documented operating procedures proving no operational dependency, shadow-mode evidence over a representative period, and review by the park's safety and engineering leads. The restraint-observation methods used here are generic illustrations and would need an original, validated design.

Legal and commercial: privacy impact assessment for station cameras, no facial recognition or identity tracking, employee-analytics agreements that keep indicators aggregate and training-oriented, regulatory review per jurisdiction, and honest contractual language that excludes any safety certification claim.
