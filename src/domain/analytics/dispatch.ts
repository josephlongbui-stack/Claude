/**
 * Dispatch / throughput math. All results are scenario projections from the
 * stated inputs — never measured customer results.
 */
export interface ThroughputInputs {
  capacity: number;
  stationDwellSec: number;
  minCycleSec: number;
  loadFactor: number;
  operatingHours: number;
  demandPerHour: number;
}

export type Bottleneck = 'station' | 'block' | 'demand';

export interface ThroughputResult {
  effectiveIntervalSec: number;
  dispatchesPerHour: number;
  hourlyCapacity: number;
  hourlyThroughput: number;
  dailyThroughput: number;
  theoreticalMaxPerHour: number;
  bottleneck: Bottleneck;
  stationLimited: boolean;
  blockLimited: boolean;
}

export function computeThroughput(i: ThroughputInputs): ThroughputResult {
  const effectiveIntervalSec = Math.max(i.stationDwellSec, i.minCycleSec);
  const dispatchesPerHour = effectiveIntervalSec > 0 ? 3600 / effectiveIntervalSec : 0;
  const hourlyCapacity = i.capacity * i.loadFactor * dispatchesPerHour;
  const hourlyThroughput = Math.min(hourlyCapacity, i.demandPerHour);
  const theoreticalMaxPerHour = i.minCycleSec > 0 ? (i.capacity * 3600) / i.minCycleSec : 0;
  const blockLimited = i.minCycleSec >= i.stationDwellSec;
  const demandLimited = i.demandPerHour < hourlyCapacity;
  const bottleneck: Bottleneck = demandLimited ? 'demand' : blockLimited ? 'block' : 'station';
  return {
    effectiveIntervalSec,
    dispatchesPerHour,
    hourlyCapacity,
    hourlyThroughput,
    dailyThroughput: hourlyThroughput * i.operatingHours,
    theoreticalMaxPerHour,
    bottleneck,
    stationLimited: !blockLimited,
    blockLimited,
  };
}

export interface ScenarioComparison {
  baseline: ThroughputResult;
  assisted: ThroughputResult;
  deltaHourly: number;
  deltaDaily: number;
  deltaPct: number;
  /** Effect of changing dispatch frequency only (baseline load factor). */
  dispatchEffect: number;
  /** Effect of changing seat fill only (baseline interval). */
  fillEffect: number;
  interaction: number;
}

export function compareScenarios(baseline: ThroughputInputs, assisted: ThroughputInputs): ScenarioComparison {
  const b = computeThroughput(baseline);
  const a = computeThroughput(assisted);
  const dispatchOnly = computeThroughput({ ...baseline, stationDwellSec: assisted.stationDwellSec, minCycleSec: assisted.minCycleSec });
  const fillOnly = computeThroughput({ ...baseline, loadFactor: assisted.loadFactor, capacity: assisted.capacity });
  const deltaHourly = a.hourlyThroughput - b.hourlyThroughput;
  const dispatchEffect = dispatchOnly.hourlyThroughput - b.hourlyThroughput;
  const fillEffect = fillOnly.hourlyThroughput - b.hourlyThroughput;
  return {
    baseline: b,
    assisted: a,
    deltaHourly,
    deltaDaily: a.dailyThroughput - b.dailyThroughput,
    deltaPct: b.hourlyThroughput > 0 ? deltaHourly / b.hourlyThroughput : 0,
    dispatchEffect,
    fillEffect,
    interaction: deltaHourly - dispatchEffect - fillEffect,
  };
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
