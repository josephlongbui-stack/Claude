export interface TrendResult {
  slopePerDay: number;
  intercept: number;
  r2: number;
  latest: number;
  projected7d: number;
  crossesThresholdOnDay: number | null;
  direction: 'rising' | 'falling' | 'stable';
}

/** Least-squares trend on a daily series. Illustrative only. */
export function linearTrend(data: { day: number; value: number }[], threshold?: number, higherIsWorse = true): TrendResult {
  const n = data.length;
  if (n < 2) return { slopePerDay: 0, intercept: data[0]?.value ?? 0, r2: 0, latest: data[0]?.value ?? 0, projected7d: data[0]?.value ?? 0, crossesThresholdOnDay: null, direction: 'stable' };
  const mx = data.reduce((a, d) => a + d.day, 0) / n;
  const my = data.reduce((a, d) => a + d.value, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const d of data) {
    sxy += (d.day - mx) * (d.value - my);
    sxx += (d.day - mx) ** 2;
    syy += (d.value - my) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
  const lastDay = data[n - 1].day;
  const latest = data[n - 1].value;
  const projected7d = intercept + slope * (lastDay + 7);
  let crossesThresholdOnDay: number | null = null;
  if (threshold !== undefined && slope !== 0) {
    const day = (threshold - intercept) / slope;
    const crosses = higherIsWorse ? slope > 0 : slope < 0;
    if (crosses && Number.isFinite(day)) crossesThresholdOnDay = Math.ceil(day);
  }
  const direction = Math.abs(slope) < 0.01 * Math.max(1, Math.abs(my)) ? 'stable' : slope > 0 ? 'rising' : 'falling';
  return { slopePerDay: slope, intercept, r2, latest, projected7d, crossesThresholdOnDay, direction };
}
