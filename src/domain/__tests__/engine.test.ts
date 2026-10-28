import { describe, expect, it } from 'vitest';
import { SimulationEngine, type AlertDraft, type EngineSinks, type EventDraftInput } from '../simulation/engine';
import { buildScenario } from '../simulation/scenarios';
import { DEFAULT_EVALUATOR_SETTINGS } from '../observation/evaluator';
import { RIDES, getRide } from '../rides/configs';
import { allSeats } from '../rides/seats';
import type { Alert, AlertTarget, AlertType, ScenarioId } from '../types';

interface Recorder extends EngineSinks {
  alerts: Alert[];
  events: EventDraftInput[];
  dispatches: number[];
  reviews: string[];
}

function recorder(): Recorder {
  const r: Recorder = {
    alerts: [],
    events: [],
    dispatches: [],
    reviews: [],
    raiseAlert(d: AlertDraft) {
      const key = (t: AlertTarget): string => (t.kind === 'seat' ? t.seatId : t.kind === 'zone' ? t.zone : t.equipmentId);
      if (r.alerts.some((a) => a.type === d.type && key(a.target) === key(d.target) && (a.status === 'open' || a.status === 'acknowledged'))) return undefined;
      const a: Alert = { id: `ALT-${r.alerts.length + 1}`, type: d.type, severity: d.severity, rideId: d.rideId, cameraId: d.cameraId, target: d.target, title: d.title, detail: d.detail, confidence: d.confidence, status: 'open', notes: [], sensor: d.sensor, evidenceRef: 'x', scenarioId: d.scenarioId, createdMs: d.atMs, createdTs: '', updatedMs: d.atMs, updatedTs: '' };
      r.alerts.push(a);
      return a;
    },
    logEvent(d) {
      r.events.push(d);
    },
    autoReview(match, outcome) {
      const key = (t: AlertTarget): string => (t.kind === 'seat' ? t.seatId : t.kind === 'zone' ? t.zone : t.equipmentId);
      const a = [...r.alerts].reverse().find((x) => x.type === match.type && (match.seatId ? key(x.target) === match.seatId : match.zone ? key(x.target) === match.zone : true) && (x.status === 'open' || x.status === 'acknowledged'));
      if (a) {
        a.status = outcome;
        r.reviews.push(`${a.id}:${outcome}`);
      }
    },
    recordDispatch(rec) {
      r.dispatches.push(rec.dwellSec);
    },
    hasOpenAlert(_ride, target, type: AlertType) {
      const key = (t: AlertTarget): string => (t.kind === 'seat' ? t.seatId : t.kind === 'zone' ? t.zone : t.equipmentId);
      return r.alerts.some((a) => a.type === type && key(a.target) === key(target) && (a.status === 'open' || a.status === 'acknowledged'));
    },
  };
  return r;
}

function run(rideId: string, id: ScenarioId, stepMs = 97): { engine: SimulationEngine; rec: Recorder } {
  const rec = recorder();
  const engine = new SimulationEngine(getRide(rideId), () => DEFAULT_EVALUATOR_SETTINGS, rec);
  engine.loadScenario(buildScenario(id, getRide(rideId)), 0);
  while (!engine.finished) engine.advance(stepMs);
  return { engine, rec };
}

describe('scenario engine', () => {
  it('scenario A raises no alerts and records a dispatch', () => {
    const { rec, engine } = run('vortex', 'A');
    expect(rec.alerts).toHaveLength(0);
    expect(rec.dispatches).toEqual([120]);
    expect(engine.phase).toBe('idle');
    expect(rec.events.some((e) => e.type === 'phase' && e.title.includes('arrives'))).toBe(true);
  });
  it('scenario B flags the staged seat on the camera, seat map and alert queue, then records the human review', () => {
    const { rec } = run('vortex', 'B');
    const seat = getRide('vortex').stagedSeats.concern;
    const alert = rec.alerts.find((a) => a.type === 'belt_position');
    expect(alert).toBeDefined();
    expect(alert?.target).toEqual({ kind: 'seat', seatId: seat });
    expect(alert?.severity).toBe('concern');
    expect(rec.reviews.some((r) => r.endsWith(':reviewed'))).toBe(true);
    expect(rec.events.some((e) => e.type === 'observation' && e.title.includes('cleared'))).toBe(true);
  });
  it('scenario C raises a loose-article alert', () => {
    const { rec } = run('vortex', 'C');
    expect(rec.alerts.some((a) => a.type === 'loose_article')).toBe(true);
  });
  it('scenario D reports the occluded seat as unknown and raises an occlusion alert', () => {
    const rec = recorder();
    const ride = getRide('vortex');
    const engine = new SimulationEngine(ride, () => DEFAULT_EVALUATOR_SETTINGS, rec);
    engine.loadScenario(buildScenario('D', ride), 0);
    engine.advanceTo(34000);
    expect(engine.seats[ride.stagedSeats.occluded].state).toBe('unknown');
    expect(rec.alerts.some((a) => a.type === 'occlusion')).toBe(true);
    engine.skipToEnd();
    expect(engine.seats[ride.stagedSeats.occluded].state).not.toBe('unknown');
  });
  it('scenario E raises a sensor-discrepancy alert carrying the fictional sensor record', () => {
    const { rec } = run('vortex', 'E');
    const a = rec.alerts.find((x) => x.type === 'sensor_discrepancy');
    expect(a?.sensor?.reading).toBe('not_engaged');
  });
  it('scenario F records a slow gate and a longer dwell', () => {
    const { rec } = run('vortex', 'F');
    expect(rec.alerts.some((a) => a.type === 'slow_gate')).toBe(true);
    expect(rec.dispatches[0]).toBeGreaterThan(120);
  });
  it('scenario G drives the slide through entry, departure, a held exit and review', () => {
    const { rec, engine } = run('typhoon', 'G');
    expect(rec.events.some((e) => e.type === 'slide_departure')).toBe(true);
    expect(rec.events.some((e) => e.type === 'slide_exit')).toBe(true);
    expect(rec.alerts.some((a) => a.type === 'exit_zone_occupied')).toBe(true);
    expect(rec.reviews.some((r) => r.endsWith(':reviewed'))).toBe(true);
    expect(engine.slide.exits.length).toBe(3);
  });
  it('scenario G holds the next rider at the top while the exit zone is occupied', () => {
    const rec = recorder();
    const ride = getRide('typhoon');
    const engine = new SimulationEngine(ride, () => DEFAULT_EVALUATOR_SETTINGS, rec);
    engine.loadScenario(buildScenario('G', ride), 0);
    let sawHold = false;
    while (!engine.finished) {
      engine.advance(250);
      if (engine.slide.exitZone.prolonged) {
        sawHold = true;
        expect(engine.slide.departures.length).toBe(1);
        expect(engine.slide.platformRider).toBeDefined();
      }
    }
    expect(sawHold).toBe(true);
  });
  it('scenario H on the dark ride reports the low-visibility seat as unknown', () => {
    const rec = recorder();
    const ride = getRide('phantom');
    const engine = new SimulationEngine(ride, () => DEFAULT_EVALUATOR_SETTINGS, rec);
    engine.loadScenario(buildScenario('H', ride), 0);
    engine.advanceTo(34000);
    expect(engine.seats[ride.stagedSeats.occluded].state).toBe('unknown');
    expect(rec.alerts.some((a) => a.type === 'low_confidence')).toBe(true);
  });
  it('keeps the session clock in step with simulation time', () => {
    const rec = recorder();
    const ride = getRide('vortex');
    const engine = new SimulationEngine(ride, () => DEFAULT_EVALUATOR_SETTINGS, rec);
    engine.loadScenario(buildScenario('A', ride), 5000);
    while (!engine.finished) engine.advance(16);
    expect(engine.sessionMs).toBe(5000 + engine.simMs);
    expect(engine.simMs).toBe(engine.durationMs);
  });
  it('is deterministic: two runs produce identical seat states, alerts and events', () => {
    const a = run('vortex', 'B', 97);
    const b = run('vortex', 'B', 61);
    expect(a.rec.alerts.map((x) => [x.type, x.target, x.severity])).toEqual(b.rec.alerts.map((x) => [x.type, x.target, x.severity]));
    expect(a.rec.events.map((e) => [e.type, e.title])).toEqual(b.rec.events.map((e) => [e.type, e.title]));
    expect(Object.values(a.engine.seats).map((s) => [s.seatId, s.state, s.frames])).toEqual(Object.values(b.engine.seats).map((s) => [s.seatId, s.state, s.frames]));
  });
  it('reset and replay restore the same starting state', () => {
    const rec = recorder();
    const ride = getRide('vortex');
    const engine = new SimulationEngine(ride, () => DEFAULT_EVALUATOR_SETTINGS, rec);
    engine.loadScenario(buildScenario('B', ride), 0);
    engine.advanceTo(40000);
    const mid = Object.values(engine.seats).map((s) => s.state);
    engine.loadScenario(buildScenario('B', ride), 0);
    expect(engine.simMs).toBe(0);
    expect(Object.values(engine.seats).every((s) => s.state === 'unknown' && s.frames === 0)).toBe(true);
    engine.advanceTo(40000);
    expect(Object.values(engine.seats).map((s) => s.state)).toEqual(mid);
  });
  it('builds a runnable scenario for every ride configuration and preset', () => {
    for (const ride of RIDES) {
      for (const preset of ride.scenarios) {
        const { engine } = run(ride.id, preset.id, 113);
        expect(engine.finished).toBe(true);
        if (ride.geometry.kind !== 'slide') expect(Object.keys(engine.seats)).toEqual(allSeats(ride.geometry));
      }
    }
  });
  it('changing ride configuration changes geometry, cameras and scenarios', () => {
    const vortex = getRide('vortex');
    const vertigo = getRide('vertigo');
    expect(allSeats(vortex.geometry)).toHaveLength(24);
    expect(allSeats(vertigo.geometry)).toHaveLength(16);
    expect(vertigo.geometry.kind).toBe('radial');
    expect(getRide('phantom').cameras.every((c) => c.mode === 'infrared')).toBe(true);
    expect(vortex.scenarios.map((p) => p.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(getRide('typhoon').scenarios.map((p) => p.id)).toContain('G');
  });
  it('ad-hoc injections take effect immediately', () => {
    const rec = recorder();
    const ride = getRide('vortex');
    const engine = new SimulationEngine(ride, () => DEFAULT_EVALUATOR_SETTINGS, rec);
    engine.loadScenario(buildScenario('A', ride), 0);
    engine.advanceTo(40000);
    engine.applyNow({ kind: 'seat', seatId: 'R2S2', patch: { occluded: true } });
    engine.advance(2000);
    expect(engine.seats.R2S2.state).toBe('unknown');
    expect(rec.alerts.some((a) => a.type === 'occlusion' && a.target.kind === 'seat' && a.target.seatId === 'R2S2')).toBe(true);
  });
});
