# RideOps AI — ride operations demo (simulation)

> **SIMULATION — NOT CERTIFIED FOR RIDE SAFETY OR DISPATCH CONTROL.**
> Every camera image, detection, sensor reading and number in this app is synthetic. Nothing connects to a ride, sends a dispatch command, or certifies a rider as safe. Green means "no issue flagged in simulation", amber means "a person needs to review", red means "possible issue". No status authorises dispatch.

RideOps AI is a demo of one idea: station cameras watch each seat during loading, flag anything that looks wrong for a person to check, keep a tamper-evident record of what that person decided, and show the park what faster, fuller dispatches would be worth.

## Run it

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. No API keys, servers or GPU are needed. Every page load starts a fresh, deterministic demo.

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run build:single` | One self-contained HTML file (for hosts that serve a single page, such as a claude.ai artifact) |
| `npm test` | Unit tests for the domain logic |
| `npm run test:e2e` | Browser tests of the main flows (starts the dev server itself) |
| `npm run lint` | ESLint |

## The six screens

- **Overview**: the four rides in the fictional park, riders per hour, and what is waiting for review.
- **Live Monitor**: four camera views, the seat map, the station cycle, flags waiting for review, and a "Try it" panel to stage a condition yourself.
- **Water Slide**: entrance and exit cameras, where each rider is, and an exit-zone review.
- **Review Log**: every flag and the human decision on it, plus the hash-chained event log with export and a tamper check.
- **Operations**: dispatch timing with a "what if loading were faster?" projection, boarding (packing groups into rows), and maintenance trends.
- **Business Case**: payback worked out step by step from editable assumptions.

## Five-minute walkthrough

1. Press **Start guided demo** at the top right. It runs seven short scenarios and moves between screens on its own.
2. Scenario A is a normal cycle on the 24-seat coaster. Every seat starts as Unknown and only turns green once several camera frames agree.
3. Scenarios B and C flag a restraint and a phone. Click the red seat to see what the camera saw and the review buttons.
4. Scenario D blocks a camera, and the seat shows as Unknown instead of being assumed fine. Scenario E has the camera and a fictional sensor disagree, so a person checks.
5. Scenario G switches to the water slide, where a rider stays too long in the exit and the next rider is held at the top.
6. Scenario H is the dark ride in infrared, where low visibility again produces Unknown, not green.
7. Finish in **Review Log** (verify the chain, then tamper with a record to see it caught), **Operations** and **Business Case**.

## What is real and what is simulated

**Real software:** the deterministic scenario engine, the conservative seat evaluator (confidence threshold, multi-frame stabilisation, blocked or unclear seats become Unknown), the camera/sensor comparison rules, the review workflow, SHA-256 hash chaining with verification (Web Crypto), JSON/CSV export, the boarding allocator, dispatch and payback arithmetic, and the maintenance trend fit.

**Simulated:** every camera frame (schematic Canvas drawings of scripted observations), every detection and confidence score, every sensor reading, the synthetic operating day behind the analytics, and the 14 days of equipment readings.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together and where a real vision service would plug in.

## Hosted demo

The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) runs lint, unit tests and the build on every pull request. On pushes to the default branch it also publishes the app to GitHub Pages at **https://josephlongbui-stack.github.io/Claude/**, once Pages is enabled under *Settings → Pages → Source: GitHub Actions*.

## Before any real pilot

- **Engineering:** a separately built and validated vision service behind the observation interface, real calibration, measured latency and uptime, and testing on recorded station footage with ground truth.
- **Safety:** a hazard analysis showing the system is advisory only, unchanged operating procedures with no dependency on it, shadow-mode evidence over a long period, and sign-off from the park's safety and engineering leads.
- **Legal:** a privacy assessment for station cameras, no facial recognition or identity tracking, and contracts that make no safety-certification claim.
