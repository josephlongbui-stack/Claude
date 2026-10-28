export type TrainingLabel = 'nominal' | 'review' | 'concern' | 'unknown' | 'false_alarm';

export interface TrainingSample {
  id: string;
  rideId: string;
  condition: 'clothing' | 'lighting' | 'partial_visibility' | 'seating_config' | 'mobility' | 'loose_object' | 'false_alarm';
  conditionLabel: string;
  description: string;
  seatId: string;
  cameraId: string;
  modelLabel: TrainingLabel;
  modelConfidence: number;
  reviewerLabel: TrainingLabel;
  /** Visual descriptor for the synthetic frame renderer. */
  visual: { variant: number; lighting: 'day' | 'evening' | 'ir'; occlusion: number; object: boolean; posture: 'seated' | 'leaning' };
}

export const TRAINING_SAMPLES: TrainingSample[] = [
  { id: 'TS-001', rideId: 'vortex', condition: 'clothing', conditionLabel: 'Bulky outerwear', description: 'Rider in a bulky winter coat; restraint edge partially hidden by fabric.', seatId: 'R2S1', cameraId: 'CAM-01', modelLabel: 'review', modelConfidence: 0.74, reviewerLabel: 'nominal', visual: { variant: 1, lighting: 'day', occlusion: 0.1, object: false, posture: 'seated' } },
  { id: 'TS-002', rideId: 'vortex', condition: 'clothing', conditionLabel: 'High-contrast patterned clothing', description: 'Striped shirt creates edge noise around the lap bar.', seatId: 'R3S3', cameraId: 'CAM-02', modelLabel: 'nominal', modelConfidence: 0.88, reviewerLabel: 'nominal', visual: { variant: 2, lighting: 'day', occlusion: 0, object: false, posture: 'seated' } },
  { id: 'TS-003', rideId: 'vortex', condition: 'lighting', conditionLabel: 'Low evening light', description: 'Station lighting at dusk; shadows across rows 5–6.', seatId: 'R5S2', cameraId: 'CAM-03', modelLabel: 'unknown', modelConfidence: 0.58, reviewerLabel: 'unknown', visual: { variant: 0, lighting: 'evening', occlusion: 0, object: false, posture: 'seated' } },
  { id: 'TS-004', rideId: 'phantom', condition: 'lighting', conditionLabel: 'Infrared illumination', description: 'Dark-ride station under IR illuminators; low texture.', seatId: 'R2S2', cameraId: 'CAM-01', modelLabel: 'nominal', modelConfidence: 0.81, reviewerLabel: 'nominal', visual: { variant: 3, lighting: 'ir', occlusion: 0, object: false, posture: 'seated' } },
  { id: 'TS-005', rideId: 'vortex', condition: 'partial_visibility', conditionLabel: 'Operator in frame', description: 'Operator checking restraints partially blocks R6S1.', seatId: 'R6S1', cameraId: 'CAM-03', modelLabel: 'unknown', modelConfidence: 0.42, reviewerLabel: 'unknown', visual: { variant: 1, lighting: 'day', occlusion: 0.55, object: false, posture: 'seated' } },
  { id: 'TS-006', rideId: 'helix', condition: 'partial_visibility', conditionLabel: 'Harness shadow', description: 'Over-the-shoulder harness casts a shadow across the lap area.', seatId: 'R4S2', cameraId: 'CAM-02', modelLabel: 'review', modelConfidence: 0.71, reviewerLabel: 'nominal', visual: { variant: 2, lighting: 'day', occlusion: 0.25, object: false, posture: 'seated' } },
  { id: 'TS-007', rideId: 'raptor', condition: 'seating_config', conditionLabel: 'Wing seat · mirrored geometry', description: 'Left-wing seat observed from the left-wing camera.', seatId: 'R3S1', cameraId: 'CAM-01', modelLabel: 'nominal', modelConfidence: 0.86, reviewerLabel: 'nominal', visual: { variant: 0, lighting: 'day', occlusion: 0, object: false, posture: 'seated' } },
  { id: 'TS-008', rideId: 'vertigo', condition: 'seating_config', conditionLabel: 'Radial seating', description: 'Outward-facing radial seat on the drop tower.', seatId: 'R1S6', cameraId: 'CAM-02', modelLabel: 'review', modelConfidence: 0.69, reviewerLabel: 'review', visual: { variant: 3, lighting: 'day', occlusion: 0.1, object: false, posture: 'leaning' } },
  { id: 'TS-009', rideId: 'vortex', condition: 'mobility', conditionLabel: 'Transfer boarding', description: 'Rider transferred from a wheelchair at the accessible row; operator assisting.', seatId: 'R1S1', cameraId: 'CAM-01', modelLabel: 'unknown', modelConfidence: 0.51, reviewerLabel: 'unknown', visual: { variant: 1, lighting: 'day', occlusion: 0.4, object: false, posture: 'seated' } },
  { id: 'TS-010', rideId: 'dipper', condition: 'mobility', conditionLabel: 'Assisted boarding', description: 'Adult assisting a child into the seat; extra hands in frame.', seatId: 'R2S2', cameraId: 'CAM-01', modelLabel: 'review', modelConfidence: 0.66, reviewerLabel: 'nominal', visual: { variant: 2, lighting: 'day', occlusion: 0.3, object: false, posture: 'seated' } },
  { id: 'TS-011', rideId: 'vortex', condition: 'loose_object', conditionLabel: 'Phone in hand', description: 'Rider holding a phone above the lap bar.', seatId: 'R2S3', cameraId: 'CAM-01', modelLabel: 'concern', modelConfidence: 0.84, reviewerLabel: 'concern', visual: { variant: 0, lighting: 'day', occlusion: 0, object: true, posture: 'seated' } },
  { id: 'TS-012', rideId: 'rapids', condition: 'loose_object', conditionLabel: 'Cap in hand', description: 'Rider holding a cap at the dock.', seatId: 'R1S2', cameraId: 'CAM-01', modelLabel: 'review', modelConfidence: 0.72, reviewerLabel: 'review', visual: { variant: 3, lighting: 'day', occlusion: 0, object: true, posture: 'seated' } },
  { id: 'TS-013', rideId: 'vortex', condition: 'false_alarm', conditionLabel: 'Bag strap mistaken for belt', description: 'Cross-body bag strap produced a restraint-position flag.', seatId: 'R4S4', cameraId: 'CAM-02', modelLabel: 'concern', modelConfidence: 0.77, reviewerLabel: 'false_alarm', visual: { variant: 1, lighting: 'day', occlusion: 0, object: false, posture: 'seated' } },
  { id: 'TS-014', rideId: 'skyward', condition: 'false_alarm', conditionLabel: 'Reflective vest trim', description: 'Reflective trim on the flying vest read as an open closure.', seatId: 'R3S1', cameraId: 'CAM-01', modelLabel: 'review', modelConfidence: 0.7, reviewerLabel: 'false_alarm', visual: { variant: 2, lighting: 'evening', occlusion: 0, object: false, posture: 'seated' } },
  { id: 'TS-015', rideId: 'cyclone', condition: 'seating_config', conditionLabel: 'Inward-facing car', description: 'Spinning car seats face inward; camera sees the rider in profile.', seatId: 'R2S3', cameraId: 'CAM-02', modelLabel: 'nominal', modelConfidence: 0.83, reviewerLabel: 'nominal', visual: { variant: 0, lighting: 'day', occlusion: 0.05, object: false, posture: 'seated' } },
  { id: 'TS-016', rideId: 'typhoon', condition: 'lighting', conditionLabel: 'Water spray & glare', description: 'Splash-zone camera with spray on the lens.', seatId: 'EXIT', cameraId: 'CAM-B', modelLabel: 'unknown', modelConfidence: 0.55, reviewerLabel: 'unknown', visual: { variant: 1, lighting: 'day', occlusion: 0.35, object: false, posture: 'seated' } },
];

export const CONDITION_LABELS: Record<TrainingSample['condition'], string> = {
  clothing: 'Different clothing',
  lighting: 'Variable lighting',
  partial_visibility: 'Partial visibility',
  seating_config: 'Seating configurations',
  mobility: 'Mobility-related boarding',
  loose_object: 'Loose objects',
  false_alarm: 'False alarms',
};

export const LABEL_OPTIONS: { value: TrainingLabel; label: string }[] = [
  { value: 'nominal', label: 'No issue (nominal)' },
  { value: 'review', label: 'Review required' },
  { value: 'concern', label: 'Potential concern' },
  { value: 'unknown', label: 'Unknown / insufficient view' },
  { value: 'false_alarm', label: 'False alarm' },
];

export interface EvalMetrics {
  precision: number;
  recall: number;
  falsePositiveRate: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  n: number;
}

/** Treats review/concern as "positive" (flag raised). Synthetic — not real-world performance. */
export function evaluate(samples: TrainingSample[], corrections: Record<string, { label: TrainingLabel }>): EvalMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const positive = (l: TrainingLabel): boolean => l === 'review' || l === 'concern';
  for (const s of samples) {
    const truth = corrections[s.id]?.label ?? s.reviewerLabel;
    const pred = positive(s.modelLabel);
    const actual = positive(truth) && truth !== 'false_alarm';
    if (pred && actual) tp += 1;
    else if (pred && !actual) fp += 1;
    else if (!pred && actual) fn += 1;
    else tn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const falsePositiveRate = fp + tn ? fp / (fp + tn) : 0;
  return { precision, recall, falsePositiveRate, tp, fp, fn, tn, n: samples.length };
}
