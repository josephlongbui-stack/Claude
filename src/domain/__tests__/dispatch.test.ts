import { describe, expect, it } from 'vitest';
import { compareScenarios, computeThroughput } from '../analytics/dispatch';
import { computeRoi, DEFAULT_ROI } from '../analytics/roi';

describe('dispatch math', () => {
  it('uses max(station dwell, min cycle) as the effective interval', () => {
    const r = computeThroughput({ capacity: 24, stationDwellSec: 120, minCycleSec: 84, loadFactor: 0.85, operatingHours: 10, demandPerHour: 10000 });
    expect(r.effectiveIntervalSec).toBe(120);
    expect(r.hourlyCapacity).toBeCloseTo((24 * 0.85 * 3600) / 120, 5);
    expect(r.bottleneck).toBe('station');
  });
  it('does not increase dispatch frequency when the block is the bottleneck', () => {
    const base = { capacity: 24, stationDwellSec: 100, minCycleSec: 110, loadFactor: 0.85, operatingHours: 10, demandPerHour: 10000 };
    const shorter = computeThroughput({ ...base, stationDwellSec: 80 });
    const baseline = computeThroughput(base);
    expect(shorter.effectiveIntervalSec).toBe(110);
    expect(shorter.hourlyCapacity).toBe(baseline.hourlyCapacity);
    expect(shorter.blockLimited).toBe(true);
    const cmp = compareScenarios(base, { ...base, stationDwellSec: 80 });
    expect(cmp.dispatchEffect).toBe(0);
  });
  it('caps throughput at demand', () => {
    const r = computeThroughput({ capacity: 24, stationDwellSec: 90, minCycleSec: 84, loadFactor: 0.9, operatingHours: 10, demandPerHour: 500 });
    expect(r.hourlyThroughput).toBe(500);
    expect(r.bottleneck).toBe('demand');
  });
  it('separates dispatch-frequency and seat-fill effects', () => {
    const base = { capacity: 24, stationDwellSec: 120, minCycleSec: 84, loadFactor: 0.85, operatingHours: 10, demandPerHour: 10000 };
    const cmp = compareScenarios(base, { ...base, stationDwellSec: 95, loadFactor: 0.92 });
    expect(cmp.dispatchEffect).toBeGreaterThan(0);
    expect(cmp.fillEffect).toBeGreaterThan(0);
    expect(cmp.dispatchEffect + cmp.fillEffect + cmp.interaction).toBeCloseTo(cmp.deltaHourly, 6);
  });
});

describe('ROI arithmetic', () => {
  it('is explainable from its inputs and finds payback', () => {
    const r = computeRoi(DEFAULT_ROI);
    expect(r.annualCost).toBe(150000);
    expect(r.firstYearCost).toBe(210000);
    expect(r.annualValue).toBeGreaterThan(0);
    expect(r.paybackMonths).toBeCloseTo(r.firstYearCost / (r.annualValue / 12), 6);
    expect(r.steps.length).toBe(6);
  });
  it('yields no value when no time is saved', () => {
    const r = computeRoi({ ...DEFAULT_ROI, secondsSavedPerCycle: 0 });
    expect(r.recoveredRidersPerYear).toBe(0);
    expect(r.paybackMonths).toBeNull();
  });
});
