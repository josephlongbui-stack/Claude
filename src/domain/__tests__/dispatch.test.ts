import { describe, expect, it } from 'vitest';
import { compareScenarios, computeThroughput, histogram } from '../analytics/dispatch';
import { computeRoi, DEFAULT_ROI } from '../analytics/roi';
import { forecastPacing } from '../analytics/pacing';
import { getRide } from '../rides/configs';

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
  it('histograms intervals into bins', () => {
    const h = histogram([100, 105, 118, 121, 140], 10);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(5);
  });
});

describe('ROI arithmetic', () => {
  it('is explainable from its inputs and finds payback', () => {
    const r = computeRoi(DEFAULT_ROI);
    expect(r.annualSoftwareCost).toBe(150000);
    expect(r.firstYearCost).toBe(210000);
    expect(r.annualValue).toBeCloseTo(r.capacityValue + r.laborSavings, 6);
    expect(r.paybackMonths).not.toBeNull();
    expect(r.steps.length).toBeGreaterThan(5);
  });
  it('yields no recovered capacity when no time is saved', () => {
    const r = computeRoi({ ...DEFAULT_ROI, secondsSavedPerCycle: 0 });
    expect(r.recoveredRidersPerYear).toBe(0);
  });
});

describe('pacing forecast', () => {
  it('identifies the block as the constraint when it clears after the station', () => {
    const f = forecastPacing(getRide('orbit'), { elapsedSec: 0, dwellSec: 100, blockClearSec: 150 });
    expect(f.limiting).toBe('block');
    expect(f.alignedAtSec).toBe(150);
  });
});
