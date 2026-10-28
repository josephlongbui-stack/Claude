import type { RideConfiguration } from '../types';

export interface PacingPoint {
  t: number;
  stationReady: number;
  blockReady: number;
  label?: string;
}

export interface PacingForecast {
  points: PacingPoint[];
  stationReadyAtSec: number;
  blockReadyAtSec: number;
  alignedAtSec: number;
  limiting: 'station' | 'block' | 'aligned';
  note: string;
}

/**
 * Forecast when simulated station readiness and downstream block availability may align.
 * Informational only — never a dispatch instruction.
 */
export function forecastPacing(ride: RideConfiguration, opts: { elapsedSec: number; dwellSec: number; blockClearSec?: number }): PacingForecast {
  const blockClear = opts.blockClearSec ?? ride.baseline.minCycleSec;
  const stationReadyAtSec = Math.max(0, opts.dwellSec - opts.elapsedSec);
  const blockReadyAtSec = Math.max(0, blockClear - opts.elapsedSec);
  const alignedAtSec = Math.max(stationReadyAtSec, blockReadyAtSec);
  const horizon = Math.max(60, alignedAtSec + 30);
  const points: PacingPoint[] = [];
  for (let t = 0; t <= horizon; t += 5) {
    points.push({ t, stationReady: Math.min(1, t / Math.max(1, stationReadyAtSec)), blockReady: Math.min(1, t / Math.max(1, blockReadyAtSec)) });
  }
  const limiting = Math.abs(stationReadyAtSec - blockReadyAtSec) < 3 ? 'aligned' : stationReadyAtSec > blockReadyAtSec ? 'station' : 'block';
  const note = limiting === 'station' ? `Station activities are projected to finish ${Math.round(stationReadyAtSec - blockReadyAtSec)}s after the block clears — loading is the pacing constraint.` : limiting === 'block' ? `The downstream block is projected to clear ${Math.round(blockReadyAtSec - stationReadyAtSec)}s after the station is ready — shorter station dwell cannot increase dispatch frequency here.` : 'Station readiness and block availability are projected to align — no slack in either.';
  return { points, stationReadyAtSec, blockReadyAtSec, alignedAtSec, limiting, note };
}
