import { SeededRandom } from '@/domain/simulation/rng';

export type TicketStatus = 'open' | 'in_review' | 'closed';
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
  evidenceSeries: EvidenceSeriesKey;
  resolution?: string;
}

export const SIM_DAYS = 14;

function series(seed: string, base: number, slope: number, noise: number): { day: number; value: number }[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: SIM_DAYS }, (_, i) => ({ day: i + 1, value: Math.max(0, base + slope * i + rng.gaussian(0, noise)) }));
}

/** 14 simulated days of synthetic measurements behind each ticket. */
export const EVIDENCE_SERIES = {
  gateB: { label: 'Gate B opening time (s)', unit: 's', threshold: 5, higherIsWorse: true, data: series('gateB', 2.1, 0.26, 0.18) },
  sensorDisagreement: { label: 'Sensor disagreements per day', unit: '', threshold: 4, higherIsWorse: true, data: series('sensorDis', 0.8, 0.28, 0.6) },
  cycleVariability: { label: 'Cycle time spread (s)', unit: 's', threshold: 12, higherIsWorse: true, data: series('cycleVar', 6, 0.55, 1.2) },
  cameraSharpness: { label: 'CAM-03 sharpness', unit: '', threshold: 0.6, higherIsWorse: false, data: series('camSharp', 0.92, -0.021, 0.02) },
} as const;

export type EvidenceSeriesKey = keyof typeof EVIDENCE_SERIES;

export const MAINTENANCE_TICKETS: MaintenanceTicket[] = [
  {
    id: 'MT-1042',
    rideId: 'vortex',
    equipmentId: 'GATE-B',
    title: 'Gate B is opening more slowly',
    finding: 'Opening time rose from about 2.1 s to about 5.4 s over 14 simulated days and passed the 5 s limit on day 12.',
    recommendation: 'Inspect the Gate B actuator and hinge in the next maintenance window.',
    priority: 'P1 · inspect now',
    status: 'open',
    evidenceSeries: 'gateB',
  },
  {
    id: 'MT-1038',
    rideId: 'vortex',
    equipmentId: 'SEN-RESTRAINT · R3S4',
    title: 'Row 3 Seat 4 sensor keeps disagreeing with the camera',
    finding: 'The fictional restraint sensor on R3S4 disagreed with the camera on several cycles a day for the last five simulated days.',
    recommendation: 'Check the sensor connector and recalibrate R3S4. Treat this as a data-quality issue.',
    priority: 'P2 · schedule',
    status: 'open',
    evidenceSeries: 'sensorDisagreement',
  },
  {
    id: 'MT-1031',
    rideId: 'vertigo',
    equipmentId: 'STATION-CYCLE',
    title: 'Cycle times are getting less consistent',
    finding: 'The spread of station cycle times roughly doubled over 14 simulated days.',
    recommendation: 'Review harness release timing and gate timing on Vertigo Tower.',
    priority: 'P2 · schedule',
    status: 'open',
    evidenceSeries: 'cycleVariability',
  },
  {
    id: 'MT-1027',
    rideId: 'vortex',
    equipmentId: 'CAM-03',
    title: 'Rear camera image getting less sharp',
    finding: 'CAM-03 sharpness fell below 0.7 on day 10, and Unknown seats on rows 5–6 went up.',
    recommendation: 'Clean the camera housing and check focus.',
    priority: 'P3 · monitor',
    status: 'in_review',
    evidenceSeries: 'cameraSharpness',
  },
];
