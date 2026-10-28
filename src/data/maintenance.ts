import { SeededRandom } from '@/domain/simulation/rng';

export type TicketStatus = 'draft' | 'open' | 'in_review' | 'closed';
export type Priority = 'P1 · inspect now' | 'P2 · schedule' | 'P3 · monitor';

export interface MaintenanceTicket {
  id: string;
  rideId: string;
  equipmentId: string;
  title: string;
  finding: string;
  recommendation: string;
  priority: Priority;
  status: TicketStatus;
  category: 'gate' | 'sensor' | 'camera' | 'cycle' | 'equipment';
  createdDay: number;
  evidenceSeries: 'gateB' | 'sensorDisagreement' | 'cycleVariability' | 'cameraSharpness' | 'warnings';
  resolution?: string;
}

export interface EquipmentHealth {
  id: string;
  rideId: string;
  label: string;
  category: MaintenanceTicket['category'];
  health: number;
  trend: 'rising' | 'stable' | 'falling';
  lastAnomalyDay: number | null;
}

export const SIM_DAYS = 14;

function series(seed: string, base: number, slope: number, noise: number, days = SIM_DAYS): { day: number; value: number }[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: days }, (_, i) => ({ day: i + 1, value: Math.max(0, base + slope * i + rng.gaussian(0, noise)) }));
}

/** 14 simulated days of synthetic measurements. */
export const EVIDENCE_SERIES = {
  gateB: { label: 'Gate B opening duration (s)', unit: 's', threshold: 5, data: series('gateB', 2.1, 0.26, 0.18) },
  sensorDisagreement: { label: 'Sensor disagreement events / day', unit: 'events', threshold: 4, data: series('sensorDis', 0.8, 0.28, 0.6) },
  cycleVariability: { label: 'Cycle time std-dev (s)', unit: 's', threshold: 12, data: series('cycleVar', 6, 0.55, 1.2) },
  cameraSharpness: { label: 'CAM-03 sharpness index', unit: 'idx', threshold: 0.6, data: series('camSharp', 0.92, -0.021, 0.02) },
  warnings: { label: 'Equipment warnings / day', unit: 'count', threshold: 3, data: series('warn', 0.6, 0.2, 0.5) },
} as const;

export const MAINTENANCE_TICKETS: MaintenanceTicket[] = [
  {
    id: 'MT-1042',
    rideId: 'vortex',
    equipmentId: 'GATE-B',
    title: 'Station Gate B — opening duration increasing',
    finding: 'Opening duration has risen from ~2.1s to ~5.4s over the previous 14 simulated days and crossed the 5.0s demonstration threshold on day 12.',
    recommendation: 'Inspect Gate B pneumatic actuator and pivot bushings during the next maintenance window; verify supply pressure and cylinder seals.',
    priority: 'P1 · inspect now',
    status: 'draft',
    category: 'gate',
    createdDay: 14,
    evidenceSeries: 'gateB',
  },
  {
    id: 'MT-1038',
    rideId: 'vortex',
    equipmentId: 'SEN-RESTRAINT · R3S4',
    title: 'Repeated sensor disagreement — Row 3 Seat 4',
    finding: 'Fictional restraint adapter on R3S4 disagreed with camera observations on 4+ cycles per day over the last five simulated days.',
    recommendation: 'Check the adapter connector and recalibrate the position reference for R3S4. Treat as data-quality issue; no safety conclusion.',
    priority: 'P2 · schedule',
    status: 'open',
    category: 'sensor',
    createdDay: 11,
    evidenceSeries: 'sensorDisagreement',
  },
  {
    id: 'MT-1031',
    rideId: 'helix',
    equipmentId: 'STATION-CYCLE',
    title: 'Increased cycle-time variability',
    finding: 'Standard deviation of station cycle time rose from ~6s to ~13s over 14 simulated days.',
    recommendation: 'Review harness-release sequencing and gate timing on Helix Storm; correlate with operator shift patterns in Workforce analytics.',
    priority: 'P2 · schedule',
    status: 'open',
    category: 'cycle',
    createdDay: 9,
    evidenceSeries: 'cycleVariability',
  },
  {
    id: 'MT-1027',
    rideId: 'vortex',
    equipmentId: 'CAM-03',
    title: 'Camera degradation — CAM-03 sharpness trending down',
    finding: 'Sharpness index on the rear-train camera fell below 0.7 on day 10; occlusion/low-confidence flags on rows 5–6 increased accordingly.',
    recommendation: 'Clean the housing and verify focus; replace the desiccant pack if condensation is present.',
    priority: 'P3 · monitor',
    status: 'in_review',
    category: 'camera',
    createdDay: 10,
    evidenceSeries: 'cameraSharpness',
  },
  {
    id: 'MT-1019',
    rideId: 'orbit',
    equipmentId: 'GONDOLA-4 · GATE',
    title: 'Repeated equipment warnings — Gondola 4 gate',
    finding: 'Synthetic controller warnings on the Gondola 4 gate increased from <1/day to ~3/day.',
    recommendation: 'Schedule gate latch inspection; log is illustrative.',
    priority: 'P2 · schedule',
    status: 'closed',
    category: 'equipment',
    createdDay: 6,
    evidenceSeries: 'warnings',
    resolution: 'Latch adjusted during simulated maintenance window (day 8). Warnings returned to baseline.',
  },
];

export const EQUIPMENT_HEALTH: EquipmentHealth[] = [
  { id: 'vortex:GATE-A', rideId: 'vortex', label: 'Vortex Run · Gate A', category: 'gate', health: 0.94, trend: 'stable', lastAnomalyDay: null },
  { id: 'vortex:GATE-B', rideId: 'vortex', label: 'Vortex Run · Gate B', category: 'gate', health: 0.41, trend: 'falling', lastAnomalyDay: 14 },
  { id: 'vortex:GATE-C', rideId: 'vortex', label: 'Vortex Run · Gate C', category: 'gate', health: 0.9, trend: 'stable', lastAnomalyDay: null },
  { id: 'vortex:CAM-03', rideId: 'vortex', label: 'Vortex Run · CAM-03', category: 'camera', health: 0.63, trend: 'falling', lastAnomalyDay: 10 },
  { id: 'vortex:SEN-R3S4', rideId: 'vortex', label: 'Vortex Run · restraint adapter R3S4', category: 'sensor', health: 0.58, trend: 'falling', lastAnomalyDay: 13 },
  { id: 'helix:CYCLE', rideId: 'helix', label: 'Helix Storm · station cycle', category: 'cycle', health: 0.66, trend: 'falling', lastAnomalyDay: 12 },
  { id: 'helix:CAM-01', rideId: 'helix', label: 'Helix Storm · CAM-01', category: 'camera', health: 0.97, trend: 'stable', lastAnomalyDay: null },
  { id: 'skyward:VEST', rideId: 'skyward', label: 'Skyward Flight · vest adapters', category: 'sensor', health: 0.88, trend: 'stable', lastAnomalyDay: 4 },
  { id: 'orbit:G4', rideId: 'orbit', label: 'Orbit Swing · Gondola 4 gate', category: 'equipment', health: 0.82, trend: 'rising', lastAnomalyDay: 8 },
  { id: 'typhoon:CAM-B', rideId: 'typhoon', label: 'Typhoon Falls · CAM-B', category: 'camera', health: 0.91, trend: 'stable', lastAnomalyDay: null },
  { id: 'rapids:DOCK', rideId: 'rapids', label: 'Rapids Rush · dock brake', category: 'equipment', health: 0.79, trend: 'stable', lastAnomalyDay: 5 },
  { id: 'vertigo:HARNESS', rideId: 'vertigo', label: 'Vertigo Tower · harness lock adapters', category: 'sensor', health: 0.93, trend: 'stable', lastAnomalyDay: null },
];

export interface AnomalyEntry {
  day: number;
  rideId: string;
  equipmentId: string;
  kind: string;
  value: string;
}

export function anomalyHistory(): AnomalyEntry[] {
  const rng = new SeededRandom('anomalies');
  const kinds: [string, string, string][] = [
    ['vortex', 'GATE-B', 'slow gate'],
    ['vortex', 'SEN-RESTRAINT · R3S4', 'sensor disagreement'],
    ['helix', 'STATION-CYCLE', 'cycle variability'],
    ['vortex', 'CAM-03', 'camera low confidence'],
    ['orbit', 'GONDOLA-4 · GATE', 'equipment warning'],
  ];
  const out: AnomalyEntry[] = [];
  for (let day = 1; day <= SIM_DAYS; day += 1) {
    const n = Math.min(4, Math.floor(day / 3) + rng.int(0, 1));
    for (let i = 0; i < n; i += 1) {
      const [rideId, equipmentId, kind] = rng.pick(kinds);
      out.push({ day, rideId, equipmentId, kind, value: kind === 'slow gate' ? `${(2 + day * 0.25 + rng.range(0, 0.4)).toFixed(1)}s` : kind === 'sensor disagreement' ? `${rng.int(1, 3)} cycles` : kind === 'cycle variability' ? `σ ${(5 + day * 0.5).toFixed(1)}s` : kind === 'camera low confidence' ? `${rng.int(2, 6)} seats` : `${rng.int(1, 3)} warnings` });
    }
  }
  return out.reverse();
}
