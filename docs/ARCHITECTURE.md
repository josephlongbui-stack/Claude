# RideOps AI — Simulation Architecture

## Data flow

```
Scenario script (A–L, per ride) ──▶ SimulationEngine (deterministic clock, step application)
                                         │
                                         ▼
                 SimulatedObservationProvider  ◀── seam for a real CV service
                 (scripted truth + seeded detector noise, 4 frames/s of sim time)
                                         │
                                         ▼
                 Conservative evaluator  ──▶  EvaluatedSeat { state, candidate, stableFrames, reasons, history }
                 (threshold, stabilisation, escalation, occlusion → unknown)
                                         │
                      ┌──────────────────┴──────────────────┐
                      ▼                                     ▼
         Simulated sensor provider + fusion        Alert derivation (one open alert per seat × type)
         (read-only fictional adapters)                     │
                      └──────────────────┬──────────────────┘
                                         ▼
                     Records store: alerts (review workflow) + hash-chained events
                                         │
                                         ▼
      Analytics: dispatch, pacing, boarding, maintenance, workforce, ROI, park overview
```

* **Determinism.** A scenario is a sorted list of timed actions. The engine applies every action with `atMs <= simMs` exactly once and generates observation frames on a fixed 250 ms grid, so the result is independent of the real-time frame rate. The RNG is reseeded per ride × scenario. Replaying a scenario produces identical seat states, alerts and events (covered by tests).
* **Rendering.** The engine ticks on `requestAnimationFrame`. Canvas camera views subscribe to every engine frame; React stores receive a snapshot about eleven times per second to keep the UI cheap and router transitions responsive.
* **Human review.** Alerts are never auto-closed. Scenario scripts can perform a *scripted* operator action (labelled "Demo Operator (scripted)") so the guided demo flows, but every action is recorded as a human review record, never as a certification.
* **Evidence.** Each event stores the SHA-256 of its canonical content plus the previous hash, computed with the Web Crypto API. Verification walks the chain from a stored anchor. This demonstrates tamper-evident logging only; records live in browser storage.
* **Ride configurations.** `RideConfiguration` describes geometry (train, radial, gondolas, vehicles, boats, slide), restraint type, cameras with coverage and placement, the applicable observation checklist, fictional sensors, applicable scenario presets and baseline operating assumptions. The seat map, camera layout, checklist, scenario buttons and analytics all derive from it.

## Future integration (separately developed, validated vision service)

```
 Station cameras ──▶ Validated CV service (separate programme) ──▶ Observation API
                                                                      │  SeatObservationSample / zone observations
                                                                      ▼
                            RideOps evaluator · review queue · event log · analytics (this MVP, unchanged)
                                                                      │
                                                           operator-facing informational display

 Ride control / interlocks ─── NOT CONNECTED (out of scope; would require a separate certified system)
```

The only code that changes is the `ObservationProvider` implementation in `src/domain/observation/provider.ts` (and a zone-observation equivalent for slides). The evaluator, review workflow, evidence log and analytics consume `SeatObservationSample`s and are agnostic to their source.

## Not implemented / limitations

* No computer-vision model runs; overlays are schematic renderings of scripted observations.
* No ride-controller, PLC, sensor or dispatch connectivity of any kind.
* Hash chaining is local and re-hashable by anyone who controls the browser store.
* The synthetic operating day, equipment series, shift statistics and training samples are generated data; analytics show scenario projections, not measurements.
* Authentication, multi-user roles, server persistence, audit export to external systems and notification integrations are intentionally absent.
* Accessibility has been considered (labels, roles, contrast) but not audited.
