import type { CameraConfig, ObservationCheck, Park, RideConfiguration, RideGeometry, ScenarioPreset, SyntheticSensorConfig } from '../types';
import { allSeats, seatsInRows } from './seats';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const checks = {
  lapBar: { id: 'lap_bar_position', label: 'Lap bar position', description: 'Simulated observation of lap bar position relative to rider; flagged gaps require human review.', category: 'restraint' } as ObservationCheck,
  harness: { id: 'harness_position', label: 'Harness position', description: 'Simulated observation of over-the-shoulder harness position; anomalies flagged for review.', category: 'restraint' } as ObservationCheck,
  vest: { id: 'vest_position', label: 'Flying vest position', description: 'Simulated observation of vest closure and position.', category: 'restraint' } as ObservationCheck,
  legRestraint: { id: 'leg_restraint', label: 'Leg restraint', description: 'Simulated observation of leg restraint engagement.', category: 'restraint' } as ObservationCheck,
  belt: { id: 'seat_belt', label: 'Seat belt', description: 'Simulated observation of secondary belt presence.', category: 'restraint' } as ObservationCheck,
  posture: { id: 'rider_posture', label: 'Rider posture', description: 'Unusual seated posture (e.g. leaning out, feet on seat) flagged for review.', category: 'position' } as ObservationCheck,
  loose: { id: 'loose_articles', label: 'Loose articles', description: 'Possible hand-held objects (phones, hats) flagged for staff attention.', category: 'object' } as ObservationCheck,
  occupancy: { id: 'occupancy', label: 'Seat occupancy', description: 'Occupied / empty / unknown per seat.', category: 'position' } as ObservationCheck,
  occlusion: { id: 'occlusion', label: 'Occlusion & confidence', description: 'Seats without a confident view are reported as unknown, never as nominal.', category: 'camera' } as ObservationCheck,
  gates: { id: 'gate_timing', label: 'Gate timing', description: 'Air-gate opening duration trend (equipment analytics).', category: 'equipment' } as ObservationCheck,
  platform: { id: 'platform_zone', label: 'Platform zone clear', description: 'Simulated detection of persons in the platform clearance envelope.', category: 'zone' } as ObservationCheck,
  entryPosition: { id: 'entry_position', label: 'Entry position', description: 'Rider start position on the slide platform, for attendant review.', category: 'position' } as ObservationCheck,
  exitZone: { id: 'exit_zone', label: 'Exit / splash zone occupancy', description: 'Prolonged occupancy of the exit zone flagged for review.', category: 'zone' } as ObservationCheck,
  spacing: { id: 'boat_spacing', label: 'Boat spacing', description: 'Simulated spacing between boats in the station and lift approach.', category: 'zone' } as ObservationCheck,
  accompaniment: { id: 'accompaniment', label: 'Accompaniment policy', description: 'Staff review flag when fictional ticketing data indicates an accompaniment requirement. No age inference from imagery.', category: 'policy' } as ObservationCheck,
  irVisibility: { id: 'ir_visibility', label: 'Low-light visibility', description: 'Infrared-style view; low-visibility seats reported as unknown.', category: 'camera' } as ObservationCheck,
};

const sensors = {
  restraint: (label = 'Restraint position adapter (fictional)'): SyntheticSensorConfig => ({ id: 'SEN-RESTRAINT', label, kind: 'restraint_position', perSeat: true }),
  harnessLock: (): SyntheticSensorConfig => ({ id: 'SEN-HARNESS', label: 'Harness lock adapter (fictional)', kind: 'harness_lock', perSeat: true }),
  occupancy: (): SyntheticSensorConfig => ({ id: 'SEN-SEAT', label: 'Seat occupancy adapter (fictional)', kind: 'seat_occupancy', perSeat: true }),
  gate: (): SyntheticSensorConfig => ({ id: 'SEN-GATE', label: 'Air-gate state adapter (fictional)', kind: 'gate_state', perSeat: false }),
  zone: (): SyntheticSensorConfig => ({ id: 'SEN-ZONE', label: 'Zone presence adapter (fictional)', kind: 'zone_presence', perSeat: false }),
};

const scenario = (id: ScenarioPreset['id'], label: string, description: string): ScenarioPreset => ({ id, label, description });

const coasterScenarios = (restraintWord: string): ScenarioPreset[] => [
  scenario('A', 'Normal loading cycle', 'Train arrives, unloads, boards and departs with no issues flagged in simulation.'),
  scenario('B', `Potential ${restraintWord} concern`, `A staged ${restraintWord} observation is flagged on the camera overlay, seat map, review queue and evidence log.`),
  scenario('C', 'Loose object', 'A simulated rider holds a phone; a loose-article flag is raised for staff review.'),
  scenario('D', 'Occluded camera', 'A seat cannot be observed confidently and is reported as Unknown — review required.'),
  scenario('E', 'Sensor disagreement', 'A synthetic camera observation conflicts with a fictional read-only sensor record.'),
  scenario('F', 'Slow station dispatch', 'A sticking air-gate extends loading; cycle time, pacing and maintenance analytics update.'),
  scenario('G', 'Optimized boarding', 'The row-assignment algorithm improves seat utilisation for a fictional party queue.'),
  scenario('J', 'Maintenance deterioration', 'Historical gate-opening measurements produce a maintenance recommendation.'),
];

function trainCameras(geometry: RideGeometry, opts: { infrared?: boolean; mirrored?: boolean } = {}): CameraConfig[] {
  const rows = geometry.rows;
  const third = Math.ceil(rows / 3);
  const front = seatsInRows(geometry, range(1, third));
  const middle = seatsInRows(geometry, range(third + 1, Math.min(rows, third * 2)));
  const rear = seatsInRows(geometry, range(third * 2 + 1, rows));
  const mode = opts.infrared ? 'infrared' : 'visible';
  const cams: CameraConfig[] = [
    { id: 'CAM-01', label: 'Front loading area', view: 'front', coverage: front, mode, placement: { x: 18, y: 14, angle: 150, fov: 62 } },
    { id: 'CAM-02', label: 'Middle train', view: 'middle', coverage: middle, mode, placement: { x: 50, y: 10, angle: 180, fov: 58 } },
    { id: 'CAM-03', label: 'Rear train', view: 'rear', coverage: rear.length ? rear : middle, mode, placement: { x: 82, y: 14, angle: 210, fov: 62 } },
    { id: 'CAM-04', label: 'Boarding gates', view: 'gates', coverage: [], mode, placement: { x: 50, y: 92, angle: 0, fov: 80 } },
  ];
  if (opts.mirrored) {
    cams[0].label = 'Left wing · front';
    cams[2].label = 'Right wing · front';
    cams[2].placement = { x: 18, y: 86, angle: 30, fov: 62 };
    cams[0].coverage = allSeats(geometry).filter((id) => Number(id.split('S')[1]) <= geometry.seatsPerRow / 2);
    cams[2].coverage = allSeats(geometry).filter((id) => Number(id.split('S')[1]) > geometry.seatsPerRow / 2);
    cams[1].label = 'Overhead · track centre';
    cams[1].view = 'overhead';
  }
  return cams;
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

// ---------------------------------------------------------------------------
// Rides
// ---------------------------------------------------------------------------

const vortexGeometry: RideGeometry = { kind: 'train', rows: 6, seatsPerRow: 4, rowLabel: 'Row', facing: 'forward' };
const helixGeometry: RideGeometry = { kind: 'train', rows: 8, seatsPerRow: 4, rowLabel: 'Row', facing: 'forward' };
const skywardGeometry: RideGeometry = { kind: 'train', rows: 7, seatsPerRow: 4, rowLabel: 'Row', facing: 'forward' };
const raptorGeometry: RideGeometry = { kind: 'train', rows: 7, seatsPerRow: 4, rowLabel: 'Row', mirrored: true, facing: 'forward' };
const cycloneGeometry: RideGeometry = { kind: 'train', rows: 4, seatsPerRow: 4, rowLabel: 'Car', facing: 'inward' };
const phantomGeometry: RideGeometry = { kind: 'vehicles', rows: 6, seatsPerRow: 3, rowLabel: 'Row', rowsPerUnit: 2, unitLabel: 'Vehicle', facing: 'forward' };
const vertigoGeometry: RideGeometry = { kind: 'radial', rows: 1, seatsPerRow: 16, rowLabel: 'Seat', facing: 'outward' };
const orbitGeometry: RideGeometry = { kind: 'gondolas', rows: 6, seatsPerRow: 4, rowLabel: 'Gondola', facing: 'inward' };
const dipperGeometry: RideGeometry = { kind: 'train', rows: 5, seatsPerRow: 2, rowLabel: 'Row', facing: 'forward' };
const typhoonGeometry: RideGeometry = { kind: 'slide', rows: 1, seatsPerRow: 1, rowLabel: 'Lane' };
const rapidsGeometry: RideGeometry = { kind: 'boats', rows: 3, seatsPerRow: 2, rowLabel: 'Row', rowsPerUnit: 3, unitLabel: 'Boat', facing: 'forward' };

export const RIDES: RideConfiguration[] = [
  {
    id: 'vortex',
    parkId: 'crestline',
    name: 'Vortex Run',
    type: 'lap_bar_coaster',
    typeLabel: 'Standard coaster · lap bar',
    restraint: 'lap_bar',
    restraintLabel: 'Hydraulic lap bar',
    description: 'Flagship 24-seat steel coaster. Six rows of four with individual lap bars. Four fixed station cameras.',
    geometry: vortexGeometry,
    cameras: trainCameras(vortexGeometry),
    checklist: [checks.occupancy, checks.lapBar, checks.posture, checks.loose, checks.occlusion, checks.platform, checks.gates],
    sensors: [sensors.restraint(), sensors.gate()],
    scenarios: coasterScenarios('restraint-position'),
    visual: { style: 'standard', accent: '#22d3ee' },
    baseline: { stationDwellSec: 120, minCycleSec: 84, loadFactor: 0.85, demandPerHour: 1100, capacity: 24 },
    stagedSeats: { concern: 'R4S2', occluded: 'R6S1', looseObject: 'R2S3', sensor: 'R3S4' },
    status: 'operating',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour', 'review_queue'],
  },
  {
    id: 'helix',
    parkId: 'crestline',
    name: 'Helix Storm',
    type: 'ots_coaster',
    typeLabel: 'Over-the-shoulder harness coaster',
    restraint: 'ots_harness',
    restraintLabel: 'Over-the-shoulder harness',
    description: 'Inverting steel coaster, eight rows of four with over-the-shoulder harnesses and a fictional harness-lock adapter.',
    geometry: helixGeometry,
    cameras: trainCameras(helixGeometry),
    checklist: [checks.occupancy, checks.harness, checks.posture, checks.loose, checks.occlusion, checks.platform, checks.gates],
    sensors: [sensors.harnessLock(), sensors.gate()],
    scenarios: coasterScenarios('harness-position'),
    visual: { style: 'standard', accent: '#a78bfa' },
    baseline: { stationDwellSec: 135, minCycleSec: 96, loadFactor: 0.82, demandPerHour: 1200, capacity: 32 },
    stagedSeats: { concern: 'R5S3', occluded: 'R8S4', looseObject: 'R1S2', sensor: 'R3S1' },
    status: 'operating',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour', 'review_queue'],
  },
  {
    id: 'skyward',
    parkId: 'crestline',
    name: 'Skyward Flight',
    type: 'flying_coaster',
    typeLabel: 'Flying coaster',
    restraint: 'flying_vest',
    restraintLabel: 'Flying vest + leg restraint',
    description: 'Prone-position flying coaster. Simulated vest and leg-restraint observations with a two-stage seat rotation in the station.',
    geometry: skywardGeometry,
    cameras: trainCameras(skywardGeometry),
    checklist: [checks.occupancy, checks.vest, checks.legRestraint, checks.posture, checks.loose, checks.occlusion, checks.platform],
    sensors: [sensors.restraint('Vest closure adapter (fictional)'), sensors.gate()],
    scenarios: coasterScenarios('vest / leg-restraint'),
    visual: { style: 'standard', accent: '#38bdf8' },
    baseline: { stationDwellSec: 150, minCycleSec: 110, loadFactor: 0.8, demandPerHour: 900, capacity: 28 },
    stagedSeats: { concern: 'R3S1', occluded: 'R7S4', looseObject: 'R2S2', sensor: 'R5S3' },
    status: 'operating',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour', 'review_queue'],
  },
  {
    id: 'raptor',
    parkId: 'crestline',
    name: 'Raptor Wing',
    type: 'wing_coaster',
    typeLabel: 'Wing coaster',
    restraint: 'ots_harness',
    restraintLabel: 'Vest-style harness (wing seats)',
    description: 'Wing coaster with seats cantilevered either side of the track. Mirrored camera geometry: one camera per wing plus an overhead track-centre view.',
    geometry: raptorGeometry,
    cameras: trainCameras(raptorGeometry, { mirrored: true }),
    checklist: [checks.occupancy, checks.harness, checks.posture, checks.loose, checks.occlusion, checks.platform],
    sensors: [sensors.harnessLock(), sensors.gate()],
    scenarios: coasterScenarios('harness-position'),
    visual: { style: 'standard', accent: '#f472b6' },
    baseline: { stationDwellSec: 140, minCycleSec: 100, loadFactor: 0.84, demandPerHour: 1000, capacity: 28 },
    stagedSeats: { concern: 'R4S4', occluded: 'R6S1', looseObject: 'R2S2', sensor: 'R3S3' },
    status: 'operating',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour', 'review_queue'],
  },
  {
    id: 'cyclone',
    parkId: 'crestline',
    name: 'Cyclone Spin',
    type: 'spinning_coaster',
    typeLabel: 'Spinning coaster',
    restraint: 'lap_bar_belt',
    restraintLabel: 'Lap bar + belt',
    description: 'Four free-spinning cars of four inward-facing seats. Camera geometry handles rotating seat orientation.',
    geometry: cycloneGeometry,
    cameras: trainCameras(cycloneGeometry),
    checklist: [checks.occupancy, checks.lapBar, checks.belt, checks.posture, checks.loose, checks.occlusion, checks.gates],
    sensors: [sensors.restraint(), sensors.gate()],
    scenarios: coasterScenarios('lap-bar'),
    visual: { style: 'standard', accent: '#fb923c' },
    baseline: { stationDwellSec: 70, minCycleSec: 45, loadFactor: 0.78, demandPerHour: 800, capacity: 16 },
    stagedSeats: { concern: 'R2S3', occluded: 'R4S1', looseObject: 'R1S4', sensor: 'R3S2' },
    status: 'delayed',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour'],
  },
  {
    id: 'phantom',
    parkId: 'crestline',
    name: 'Phantom Manor',
    type: 'dark_ride',
    typeLabel: 'Indoor dark ride',
    restraint: 'lap_belt',
    restraintLabel: 'Lap belt + bar',
    description: 'Indoor trackless dark ride. Three vehicles of two rows of three. Infrared-style station cameras; low-visibility seats are reported as unknown.',
    geometry: phantomGeometry,
    cameras: trainCameras(phantomGeometry, { infrared: true }),
    checklist: [checks.occupancy, checks.belt, checks.posture, checks.loose, checks.irVisibility, checks.occlusion],
    sensors: [sensors.occupancy(), sensors.gate()],
    scenarios: [
      scenario('A', 'Normal vehicle loading', 'Vehicles load under infrared illumination with no issues flagged.'),
      scenario('I', 'Dark ride low visibility', 'Infrared-style imagery and a low-visibility seat demonstrate conservative uncertainty handling.'),
      scenario('C', 'Loose object', 'A phone is held up in the dark; flagged for staff review.'),
      scenario('D', 'Occluded camera', 'A scenic element blocks a camera; the seat becomes unknown.'),
    ],
    visual: { style: 'infrared', accent: '#84cc16' },
    baseline: { stationDwellSec: 40, minCycleSec: 30, loadFactor: 0.75, demandPerHour: 1400, capacity: 18 },
    stagedSeats: { concern: 'R3S2', occluded: 'R6S3', looseObject: 'R1S1', sensor: 'R4S2' },
    status: 'operating',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour'],
  },
  {
    id: 'vertigo',
    parkId: 'crestline',
    name: 'Vertigo Tower',
    type: 'drop_tower',
    typeLabel: 'Drop tower',
    restraint: 'ots_harness',
    restraintLabel: 'Over-the-shoulder harness',
    description: 'Sixteen-seat radial gondola drop tower. Four cameras cover the four seat quadrants.',
    geometry: vertigoGeometry,
    cameras: [
      { id: 'CAM-01', label: 'North quadrant', view: 'side', coverage: ['R1S1', 'R1S2', 'R1S3', 'R1S4'], mode: 'visible', placement: { x: 50, y: 6, angle: 180, fov: 70 } },
      { id: 'CAM-02', label: 'East quadrant', view: 'side', coverage: ['R1S5', 'R1S6', 'R1S7', 'R1S8'], mode: 'visible', placement: { x: 94, y: 50, angle: 270, fov: 70 } },
      { id: 'CAM-03', label: 'South quadrant', view: 'side', coverage: ['R1S9', 'R1S10', 'R1S11', 'R1S12'], mode: 'visible', placement: { x: 50, y: 94, angle: 0, fov: 70 } },
      { id: 'CAM-04', label: 'West quadrant', view: 'side', coverage: ['R1S13', 'R1S14', 'R1S15', 'R1S16'], mode: 'visible', placement: { x: 6, y: 50, angle: 90, fov: 70 } },
    ],
    checklist: [checks.occupancy, checks.harness, checks.posture, checks.loose, checks.occlusion, checks.platform],
    sensors: [sensors.harnessLock(), sensors.zone()],
    scenarios: [
      scenario('A', 'Normal cycle', 'Gondola loads and the cycle is recorded with no issues flagged.'),
      scenario('B', 'Harness-position concern', 'A staged harness observation on one radial seat.'),
      scenario('D', 'Occluded quadrant', 'A quadrant camera is partially blocked; affected seats become unknown.'),
      scenario('E', 'Sensor disagreement', 'Fictional harness-lock adapter disagrees with the camera observation.'),
    ],
    visual: { style: 'standard', accent: '#f87171' },
    baseline: { stationDwellSec: 90, minCycleSec: 75, loadFactor: 0.8, demandPerHour: 600, capacity: 16 },
    stagedSeats: { concern: 'R1S6', occluded: 'R1S14', looseObject: 'R1S3', sensor: 'R1S10' },
    status: 'operating',
    metrics: ['cycle_interval', 'load_factor', 'riders_per_hour'],
  },
  {
    id: 'orbit',
    parkId: 'crestline',
    name: 'Orbit Swing',
    type: 'flat_ride',
    typeLabel: 'Flat ride · rotating gondolas',
    restraint: 'lap_bar',
    restraintLabel: 'Shared lap bar per gondola',
    description: 'Six four-seat gondolas on a rotating arm with individual air gates. Gate observation per gondola.',
    geometry: orbitGeometry,
    cameras: [
      { id: 'CAM-01', label: 'Gondolas 1–3', view: 'side', coverage: seatsInRows(orbitGeometry, [1, 2, 3]), mode: 'visible', placement: { x: 20, y: 12, angle: 150, fov: 75 } },
      { id: 'CAM-02', label: 'Gondolas 4–6', view: 'side', coverage: seatsInRows(orbitGeometry, [4, 5, 6]), mode: 'visible', placement: { x: 80, y: 12, angle: 210, fov: 75 } },
      { id: 'CAM-03', label: 'Entry gates', view: 'gates', coverage: [], mode: 'visible', placement: { x: 50, y: 92, angle: 0, fov: 85 } },
    ],
    checklist: [checks.occupancy, checks.lapBar, checks.posture, checks.loose, checks.occlusion, checks.gates, checks.platform],
    sensors: [sensors.gate(), sensors.restraint()],
    scenarios: [
      scenario('A', 'Normal cycle', 'All gondolas load and the cycle is recorded.'),
      scenario('B', 'Lap-bar concern', 'A staged lap-bar observation on one gondola seat.'),
      scenario('F', 'Slow gate', 'One gondola gate opens slowly, extending the cycle.'),
      scenario('J', 'Maintenance deterioration', 'Gate-timing history produces a recommendation.'),
    ],
    visual: { style: 'standard', accent: '#fbbf24' },
    baseline: { stationDwellSec: 110, minCycleSec: 150, loadFactor: 0.7, demandPerHour: 500, capacity: 24 },
    stagedSeats: { concern: 'R3S2', occluded: 'R5S4', looseObject: 'R1S1', sensor: 'R2S3' },
    status: 'maintenance',
    metrics: ['cycle_interval', 'load_factor', 'riders_per_hour'],
  },
  {
    id: 'dipper',
    parkId: 'crestline',
    name: 'Little Dipper',
    type: 'family_ride',
    typeLabel: 'Kiddie / family coaster',
    restraint: 'lap_belt',
    restraintLabel: 'Lap belt + padded bar',
    description: 'Family coaster with five two-seat rows. Includes a staff-review flag for the accompaniment policy driven by fictional ticketing data — never by age inference from imagery.',
    geometry: dipperGeometry,
    cameras: [
      { id: 'CAM-01', label: 'Station · front', view: 'front', coverage: seatsInRows(dipperGeometry, [1, 2, 3]), mode: 'visible', placement: { x: 25, y: 14, angle: 160, fov: 70 } },
      { id: 'CAM-02', label: 'Station · rear', view: 'rear', coverage: seatsInRows(dipperGeometry, [4, 5]), mode: 'visible', placement: { x: 75, y: 14, angle: 200, fov: 70 } },
      { id: 'CAM-03', label: 'Boarding gates', view: 'gates', coverage: [], mode: 'visible', placement: { x: 50, y: 92, angle: 0, fov: 80 } },
    ],
    checklist: [checks.occupancy, checks.belt, checks.posture, checks.loose, checks.occlusion, checks.accompaniment],
    sensors: [sensors.occupancy()],
    scenarios: [
      scenario('A', 'Normal loading', 'Family groups board with no issues flagged.'),
      scenario('L', 'Accompaniment review', 'Fictional ticketing data indicates a row that requires a staff accompaniment check.'),
      scenario('C', 'Loose object', 'A hand-held toy is flagged as a loose article.'),
    ],
    visual: { style: 'standard', accent: '#4ade80' },
    baseline: { stationDwellSec: 75, minCycleSec: 50, loadFactor: 0.7, demandPerHour: 400, capacity: 10 },
    stagedSeats: { concern: 'R3S1', occluded: 'R5S2', looseObject: 'R2S2', sensor: 'R1S1' },
    status: 'operating',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour'],
  },
  {
    id: 'typhoon',
    parkId: 'bluelagoon',
    name: 'Typhoon Falls',
    type: 'water_slide',
    typeLabel: 'Body slide',
    restraint: 'none_slide',
    restraintLabel: 'No restraint (body slide)',
    description: 'Flagship enclosed body slide with a start platform and a splash-out run-out. Two synchronized cameras: slide entrance and slide exit.',
    geometry: typhoonGeometry,
    cameras: [
      { id: 'CAM-A', label: 'Slide entrance', view: 'entrance', coverage: ['R1S1'], mode: 'visible', placement: { x: 22, y: 20, angle: 140, fov: 70 } },
      { id: 'CAM-B', label: 'Slide exit', view: 'exit', coverage: [], mode: 'visible', placement: { x: 78, y: 80, angle: 320, fov: 70 } },
    ],
    checklist: [checks.entryPosition, checks.exitZone, checks.occlusion, { id: 'queue_zone', label: 'Queue zone', description: 'Waiting riders in the platform queue zone.', category: 'zone' }],
    sensors: [sensors.zone()],
    scenarios: [
      scenario('H', 'Water slide exit occupied', 'A staged exit-zone occupancy persists; the dashboard highlights that human review is required.'),
      scenario('A', 'Normal slide cycle', 'Riders queue, are reviewed at the platform, depart and exit normally.'),
    ],
    visual: { style: 'water', accent: '#22d3ee' },
    baseline: { stationDwellSec: 28, minCycleSec: 24, loadFactor: 1, demandPerHour: 180, capacity: 1 },
    stagedSeats: { concern: 'R1S1', occluded: 'R1S1', looseObject: 'R1S1', sensor: 'R1S1' },
    status: 'operating',
    metrics: ['dispatch_interval', 'riders_per_hour', 'queue_length'],
  },
  {
    id: 'rapids',
    parkId: 'bluelagoon',
    name: 'Rapids Rush',
    type: 'water_coaster',
    typeLabel: 'Water coaster / flume',
    restraint: 'lap_belt',
    restraintLabel: 'Lap belt per seat',
    description: 'Water coaster with six-seat boats. Boat occupancy and station spacing analytics.',
    geometry: rapidsGeometry,
    cameras: [
      { id: 'CAM-01', label: 'Loading dock', view: 'front', coverage: allSeats(rapidsGeometry), mode: 'visible', placement: { x: 30, y: 14, angle: 160, fov: 70 } },
      { id: 'CAM-02', label: 'Lift approach · overhead', view: 'overhead', coverage: [], mode: 'visible', placement: { x: 75, y: 50, angle: 270, fov: 60 } },
      { id: 'CAM-03', label: 'Dock gates', view: 'gates', coverage: [], mode: 'visible', placement: { x: 30, y: 90, angle: 0, fov: 80 } },
    ],
    checklist: [checks.occupancy, checks.belt, checks.posture, checks.loose, checks.spacing, checks.occlusion],
    sensors: [sensors.occupancy(), sensors.zone()],
    scenarios: [
      scenario('A', 'Normal boat cycle', 'A boat loads, departs and the next boat advances with nominal spacing.'),
      scenario('K', 'Boat spacing', 'Simulated boat spacing in the lift approach falls below the configured demonstration threshold.'),
      scenario('C', 'Loose object', 'A phone is held up in the boat; flagged for staff attention.'),
    ],
    visual: { style: 'water', accent: '#2dd4bf' },
    baseline: { stationDwellSec: 45, minCycleSec: 40, loadFactor: 0.8, demandPerHour: 450, capacity: 6 },
    stagedSeats: { concern: 'R2S1', occluded: 'R3S2', looseObject: 'R1S2', sensor: 'R2S2' },
    status: 'operating',
    metrics: ['dispatch_interval', 'load_factor', 'riders_per_hour', 'boat_spacing'],
  },
];

export const PARKS: Park[] = [
  { id: 'crestline', name: 'Crestline Adventure Park', kind: 'theme', location: 'Fictional · Region West', rideIds: ['vortex', 'helix', 'skyward', 'raptor', 'cyclone', 'phantom', 'vertigo', 'orbit', 'dipper'] },
  { id: 'bluelagoon', name: 'Blue Lagoon Waterpark', kind: 'water', location: 'Fictional · Region West', rideIds: ['typhoon', 'rapids'] },
];

export const RIDE_BY_ID: Record<string, RideConfiguration> = Object.fromEntries(RIDES.map((r) => [r.id, r]));
export const PARK_BY_ID: Record<string, Park> = Object.fromEntries(PARKS.map((p) => [p.id, p]));

export function getRide(id: string): RideConfiguration {
  return RIDE_BY_ID[id] ?? RIDES[0];
}

export function ridesForPark(parkId: string): RideConfiguration[] {
  return RIDES.filter((r) => r.parkId === parkId);
}

export const DEFAULT_RIDE_ID = 'vortex';
export const DEFAULT_PARK_ID = 'crestline';
export const WATER_SLIDE_RIDE_ID = 'typhoon';
