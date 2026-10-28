# RideOps AI — Implementation Plan

> **Superseded.** This was the first, broader plan. The product was later cut back to six screens and four rides; see the README and `docs/ARCHITECTURE.md` for what exists now.

_Status: approved-by-default for an autonomous build session. Written before any application code._

## 0. Repository context (what was actually found)

| Item | Finding |
|---|---|
| Existing code | None. The repository contained a single unrelated spreadsheet (`Summer2027_Internship_Tracker.xlsx`). |
| `CLAUDE.md` / `.claude/` | Not present. |
| `Pasted markdown(2).md` (original product spec) | **Not found** anywhere in the repository, other branches, or the filesystem. The build request itself is therefore the source of requirements. Nothing from a spec file is claimed to have been read. |
| Reusable assets | None. |
| Toolchain | Node 22, npm registry reachable, Playwright 1.63 + Chromium pre-installed. |

Decision: scaffold a fresh React + TypeScript + Vite application in the repository root. The spreadsheet is left untouched.

## 1. Stack

* React 19 + TypeScript (strict) + Vite
* Tailwind CSS v4 (via `@tailwindcss/vite`)
* lucide-react icons, Recharts charts, react-router-dom v7
* Zustand stores (one per concern, composed through a simulation engine)
* Browser `localStorage` for review notes, calibration presets, label corrections, settings
* Canvas 2D for camera views, SVG for ride diagrams, placement diagrams and timelines
* Vitest for domain logic, Playwright for critical end-to-end flows
* No backend, no API keys, no network calls at runtime

## 2. Architecture

```
Scenario Script ─▶ Scenario Engine (clock, step application)
                     │
                     ▼
     Observation Provider (simulated)  ──▶  Sensor Provider (simulated, read-only)
                     │                                   │
                     └──────────────┬────────────────────┘
                                    ▼
                  Conservative Observation Evaluator
          (thresholds, multi-frame stabilisation, occlusion → unknown)
                                    │
                                    ▼
          Seat / zone states ──▶ Review Queue (alerts, human workflow)
                                    │
                                    ▼
                  Event Log (SHA-256 hash-chained records)
                                    │
                                    ▼
    Operations analytics (dispatch, pacing, maintenance, workforce, ROI)
```

Module layout (`src/`):

* `domain/types.ts` — all shared domain types
* `domain/rides/` — `RideConfiguration` model + 11 configurations + park fixture
* `domain/simulation/` — seeded RNG, scenario scripts A–J, guided-demo sequence, engine reducer
* `domain/observation/` — `ObservationProvider` interface, simulated provider, simulated sensor provider, evaluator
* `domain/review/` — alert state machine
* `domain/evidence/` — event records, SHA-256 hash chain (Web Crypto), verification, CSV/JSON export
* `domain/analytics/` — dispatch math, boarding allocator, pacing forecast, maintenance trends, workforce aggregates, ROI
* `store/` — Zustand stores (`simulation`, `review`, `evidence`, `settings`, `maintenance`, `training`)
* `components/` — shell, primitives (Panel, StatTile, Badge, DataTable, SimulationBanner, …)
* `features/` — page-level feature modules
* `pages/` — route components wired to the sidebar

The UI never reads scenario data directly; it reads evaluated state from the stores, so a real observation backend can replace `SimulatedObservationProvider` without UI changes.

## 3. Data model (key types)

* `RideConfiguration { id, name, type, restraint, geometry, cameras[], checklist[], sensors[], scenarioIds[], visual }`
* `SeatObservation { seatId, occupancy, restraint, posture, looseObject, confidence, occluded, frameCount }`
* `SeatState = empty | nominal | review | concern | unknown`
* `Alert { id, type, severity, rideId, cameraId, target, confidence, status, notes[], sensor?, evidenceRef }`
* `EventRecord { id, seq, ts, rideId, cameraId, target, type, severity, confidence, sensor?, reviewStatus, notes, evidenceRef, prevHash, hash }`
* `ScenarioScript { id, name, rideId, durationMs, steps: { atMs, action }[] }`

## 4. Simulation engine

* Deterministic: a scenario is a list of timed actions; the engine applies every step with `atMs <= simTime` exactly once, in order. Reset rebuilds from the seed. Replaying yields identical seat states, alerts and events (verified by a test).
* Clock: `requestAnimationFrame` loop advancing `simTime` by wall-time × speed; play/pause/reset/skip/speed are store actions.
* Guided demo: ordered sequence A→J with auto-navigation and a narration strip; "Skip" completes the current script instantly and advances.
* Scenario presets A–J as specified; each declares the ride it targets so the ride selector follows the scenario.

## 5. Build order and feature checklist

Phase 1 — core: shell, sidebar/top-bar, stores, engine, ride model, 24-seat train map, 4 Canvas camera views, seat inspector, alerts & review, observation timeline, sensor-fusion panel, uncertainty controls, Scenario A–E.
Phase 2 — water slide monitor: 2 camera views, slide schematic, staged sequence, analytics chart, Scenario H.
Phase 3 — operations: Smart Boarding (allocator + drag/drop), Dispatch Analytics (baseline vs assisted), Park Overview, Predictive Maintenance, Workforce & Training, Safety Review & Evidence (filters, export, hash chain), four agents (Batching, Pacing, Fault Detection, Staffing).
Phase 4 — breadth: remaining ride configurations with generic diagrams/checklists/scenarios, Ride Configuration + calibration, Training Data review, Business Impact ROI, Pilot & Deployment, tests, README, polish.

## 6. Tests

Vitest: seat-state mapping, evaluator (low confidence, occlusion, stabilisation, no affirmative on insufficient data), review transitions, scenario determinism, dispatch math incl. block-limited case, boarding allocator constraints, hash chain verification/tamper detection, ride configuration switching, reset/replay.
Playwright: app loads, sidebar navigation, seat inspector, scenario trigger → alert → review, water slide run, export.

## 7. Genuinely implemented vs simulated

**Real software:** routing, state management, scenario engine, evaluator logic, review workflow, hash chaining and verification, boarding allocator, dispatch math, ROI math, analytics aggregation, exports, calibration region editor, label storage.

**Simulated:** every camera image, detection box, confidence score, restraint/posture/loose-object observation, sensor reading, equipment measurement, staffing metric and model-evaluation metric. All are generated from seeded synthetic scripts and labelled as such in the UI.

## 8. Known limitations

* No computer vision model runs; overlays are schematic renderings of scripted observations.
* No ride-controller or sensor connectivity of any kind; no dispatch control.
* Hash chaining is a tamper-evidence demonstration in local storage, not a forensic system.
* Financial and throughput figures are scenario projections from editable inputs.
* Maintenance "forecasts" are trend illustrations on synthetic series.
