import type { CameraConfig, RideConfiguration, RideGeometry, ScenarioPreset } from '../types';
import { seatsInRows } from './seats';

/** The one fictional park the demo runs in. */
export const PARK = { name: 'Crestline Adventure Park', location: 'Fictional park · synthetic data' };

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

/** Three seat cameras split front / middle / rear, plus one gate camera. */
function trainCameras(geometry: RideGeometry, mode: CameraConfig['mode'] = 'visible'): CameraConfig[] {
  const third = Math.ceil(geometry.rows / 3);
  return [
    { id: 'CAM-01', label: 'Front of train', view: 'front', coverage: seatsInRows(geometry, range(1, third)), mode },
    { id: 'CAM-02', label: 'Middle of train', view: 'middle', coverage: seatsInRows(geometry, range(third + 1, third * 2)), mode },
    { id: 'CAM-03', label: 'Rear of train', view: 'rear', coverage: seatsInRows(geometry, range(third * 2 + 1, geometry.rows)), mode },
    { id: 'CAM-04', label: 'Boarding gates', view: 'gates', coverage: [], mode },
  ];
}

const coasterScenarios: ScenarioPreset[] = [
  { id: 'A', label: 'Normal loading' },
  { id: 'B', label: 'Restraint concern' },
  { id: 'C', label: 'Loose object' },
  { id: 'D', label: 'Blocked camera' },
  { id: 'E', label: 'Sensor disagreement' },
  { id: 'F', label: 'Slow gate' },
];

const vortexGeometry: RideGeometry = { kind: 'train', rows: 6, seatsPerRow: 4, rowLabel: 'Row' };
const phantomGeometry: RideGeometry = { kind: 'vehicles', rows: 6, seatsPerRow: 3, rowLabel: 'Row', rowsPerUnit: 2, unitLabel: 'Vehicle' };
const vertigoGeometry: RideGeometry = { kind: 'radial', rows: 1, seatsPerRow: 16, rowLabel: 'Seat' };
const typhoonGeometry: RideGeometry = { kind: 'slide', rows: 1, seatsPerRow: 1, rowLabel: 'Lane' };

export const RIDES: RideConfiguration[] = [
  {
    id: 'vortex',
    name: 'Vortex Run',
    type: 'coaster',
    typeLabel: 'Roller coaster',
    restraint: 'lap_bar',
    restraintLabel: 'Lap bar',
    geometry: vortexGeometry,
    cameras: trainCameras(vortexGeometry),
    sensors: [{ id: 'SEN-RESTRAINT', label: 'Restraint position adapter (fictional)', perSeat: true }],
    scenarios: coasterScenarios,
    baseline: { stationDwellSec: 120, minCycleSec: 84, loadFactor: 0.85, demandPerHour: 1100, capacity: 24 },
    stagedSeats: { concern: 'R4S2', occluded: 'R6S1', looseObject: 'R2S3', sensor: 'R3S4' },
    status: 'operating',
  },
  {
    id: 'phantom',
    name: 'Phantom Manor',
    type: 'dark_ride',
    typeLabel: 'Dark ride',
    restraint: 'lap_belt',
    restraintLabel: 'Lap belt',
    geometry: phantomGeometry,
    cameras: trainCameras(phantomGeometry, 'infrared'),
    sensors: [],
    scenarios: [
      { id: 'A', label: 'Normal loading' },
      { id: 'H', label: 'Low visibility' },
      { id: 'C', label: 'Loose object' },
    ],
    baseline: { stationDwellSec: 40, minCycleSec: 30, loadFactor: 0.75, demandPerHour: 1400, capacity: 18 },
    stagedSeats: { concern: 'R3S2', occluded: 'R6S3', looseObject: 'R1S1', sensor: 'R4S2' },
    status: 'operating',
  },
  {
    id: 'vertigo',
    name: 'Vertigo Tower',
    type: 'drop_tower',
    typeLabel: 'Drop tower',
    restraint: 'ots_harness',
    restraintLabel: 'Shoulder harness',
    geometry: vertigoGeometry,
    cameras: [
      { id: 'CAM-01', label: 'North seats', view: 'side', coverage: ['R1S1', 'R1S2', 'R1S3', 'R1S4'], mode: 'visible' },
      { id: 'CAM-02', label: 'East seats', view: 'side', coverage: ['R1S5', 'R1S6', 'R1S7', 'R1S8'], mode: 'visible' },
      { id: 'CAM-03', label: 'South seats', view: 'side', coverage: ['R1S9', 'R1S10', 'R1S11', 'R1S12'], mode: 'visible' },
      { id: 'CAM-04', label: 'West seats', view: 'side', coverage: ['R1S13', 'R1S14', 'R1S15', 'R1S16'], mode: 'visible' },
    ],
    sensors: [{ id: 'SEN-HARNESS', label: 'Harness lock adapter (fictional)', perSeat: true }],
    scenarios: [
      { id: 'A', label: 'Normal cycle' },
      { id: 'B', label: 'Harness concern' },
      { id: 'D', label: 'Blocked camera' },
      { id: 'E', label: 'Sensor disagreement' },
    ],
    baseline: { stationDwellSec: 90, minCycleSec: 75, loadFactor: 0.8, demandPerHour: 600, capacity: 16 },
    stagedSeats: { concern: 'R1S6', occluded: 'R1S14', looseObject: 'R1S3', sensor: 'R1S10' },
    status: 'delayed',
  },
  {
    id: 'typhoon',
    name: 'Typhoon Falls',
    type: 'water_slide',
    typeLabel: 'Water slide',
    restraint: 'none',
    restraintLabel: 'No restraint',
    geometry: typhoonGeometry,
    cameras: [
      { id: 'CAM-A', label: 'Slide entrance', view: 'entrance', coverage: [], mode: 'visible' },
      { id: 'CAM-B', label: 'Slide exit', view: 'exit', coverage: [], mode: 'visible' },
    ],
    sensors: [],
    scenarios: [
      { id: 'G', label: 'Exit zone occupied' },
      { id: 'A', label: 'Normal riders' },
    ],
    baseline: { stationDwellSec: 28, minCycleSec: 24, loadFactor: 1, demandPerHour: 180, capacity: 1 },
    stagedSeats: { concern: 'R1S1', occluded: 'R1S1', looseObject: 'R1S1', sensor: 'R1S1' },
    status: 'operating',
  },
];

export const RIDE_BY_ID: Record<string, RideConfiguration> = Object.fromEntries(RIDES.map((r) => [r.id, r]));

export function getRide(id: string): RideConfiguration {
  return RIDE_BY_ID[id] ?? RIDES[0];
}

export const DEFAULT_RIDE_ID = 'vortex';
export const WATER_SLIDE_RIDE_ID = 'typhoon';

export function isSlide(rideId: string): boolean {
  return getRide(rideId).geometry.kind === 'slide';
}
