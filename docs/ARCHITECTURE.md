# RideOps AI — architecture

## Data flow

```
Scenario script (A–H, per ride) ──▶ SimulationEngine (fixed 250 ms frame grid)
                                         │
                                         ▼
                 SimulatedObservationProvider   ◀── where a real vision service would plug in
                 (scripted truth + seeded detector noise)
                                         │
                                         ▼
                 Conservative evaluator ──▶ seat state: empty · nominal · review · concern · unknown
                 (threshold, stabilisation, blocked view → unknown)
                                         │
                      ┌──────────────────┴──────────────────┐
                      ▼                                     ▼
         Fictional sensor comparison              Flags (one open flag per seat and type)
                      └──────────────────┬──────────────────┘
                                         ▼
                 Records store: flags with human review + hash-chained event log
                                         │
                                         ▼
                 Overview · Operations · Business Case
```

- **Determinism.** A scenario is a sorted list of timed actions. The engine applies each action once and evaluates frames on a fixed 250 ms grid, so the outcome does not depend on the browser's frame rate. The random source is seeded per ride and scenario, and replays are identical (covered by tests).
- **One clock.** The session clock is always the scenario's start time plus simulation time, so event timestamps, camera overlays and seat history agree.
- **Rendering.** The engine ticks on `requestAnimationFrame`. Camera canvases redraw on every engine frame, while React state updates about 11 times a second.
- **Human review.** Flags are never closed automatically. Scripted scenarios can play a labelled "Demo Operator (scripted)" so the guided demo flows, and those actions are logged as human review records, never as certifications.
- **Session-only state.** Nothing is persisted, so a reload always starts a clean demo and stale open flags can't hide new ones.
- **Evidence.** Each event stores the SHA-256 of its canonical content plus the previous hash. Verification walks the chain from its anchor. This demonstrates tamper evidence only.

## Rides

`RideConfiguration` describes geometry (train, vehicles, radial or slide), restraint, cameras with seat coverage, fictional sensors, the scenarios that apply, and baseline operating numbers. Four rides cover the main shapes: a 24-seat coaster, an infrared dark ride, a 16-seat drop tower and a water slide.

## Future integration

```
 Station cameras ──▶ Validated vision service (separate programme) ──▶ SeatObservationSample
                                                                            │
                                   RideOps evaluator · review · log · analytics (unchanged)

 Ride control / interlocks ─── NOT CONNECTED (out of scope; would need a separately certified system)
```

Only the `ObservationProvider` in `src/domain/observation/provider.ts` (and a zone equivalent for the slide) would change.

## Not implemented

- No vision model runs; overlays are drawings of scripted observations.
- No ride-controller, PLC, sensor or dispatch connection of any kind.
- The hash chain lives in the browser and anyone with access can re-hash it.
- No login, roles, server storage or notifications.
