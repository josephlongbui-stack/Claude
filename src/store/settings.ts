import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AlertType, DemoMode, EvaluatorSettings, SeatId } from '@/domain/types';
import { DEFAULT_EVALUATOR_SETTINGS } from '@/domain/observation/evaluator';

export interface CalibrationRegion { x: number; y: number; w: number; h: number }
export interface CalibrationPreset {
  id: string;
  name: string;
  rideId: string;
  cameraId: string;
  regions: Record<SeatId, CalibrationRegion>;
  createdAt: string;
}

export type LightingMode = 'daylight' | 'evening' | 'infrared';
export type LowConfidenceHandling = 'unknown_review' | 'unknown_hold';

export const ALL_ALERT_TYPES: AlertType[] = ['belt_position', 'restraint_mismatch', 'loose_article', 'posture', 'occlusion', 'low_confidence', 'slow_gate', 'sensor_discrepancy', 'exit_zone_occupied', 'entry_position', 'spacing', 'policy_review', 'camera_degraded', 'cycle_variability'];

interface SettingsState {
  evaluator: EvaluatorSettings;
  mode: DemoMode;
  lighting: LightingMode;
  privacySilhouettes: boolean;
  retentionDays: number;
  enabledAlerts: Record<AlertType, boolean>;
  lowConfidenceHandling: LowConfidenceHandling;
  presets: CalibrationPreset[];
  activePresetByRide: Record<string, string | undefined>;
  reviewerName: string;
  setEvaluator: (patch: Partial<EvaluatorSettings>) => void;
  setMode: (mode: DemoMode) => void;
  setLighting: (l: LightingMode) => void;
  setPrivacySilhouettes: (v: boolean) => void;
  setRetentionDays: (d: number) => void;
  setAlertEnabled: (t: AlertType, v: boolean) => void;
  setLowConfidenceHandling: (v: LowConfidenceHandling) => void;
  savePreset: (p: Omit<CalibrationPreset, 'id' | 'createdAt'>) => CalibrationPreset;
  deletePreset: (id: string) => void;
  setActivePreset: (rideId: string, id: string | undefined) => void;
  setReviewerName: (n: string) => void;
  resetSettings: () => void;
}

const defaults = {
  evaluator: DEFAULT_EVALUATOR_SETTINGS,
  mode: 'assisted' as DemoMode,
  lighting: 'daylight' as LightingMode,
  privacySilhouettes: true,
  retentionDays: 30,
  enabledAlerts: Object.fromEntries(ALL_ALERT_TYPES.map((t) => [t, true])) as Record<AlertType, boolean>,
  lowConfidenceHandling: 'unknown_review' as LowConfidenceHandling,
  presets: [] as CalibrationPreset[],
  activePresetByRide: {} as Record<string, string | undefined>,
  reviewerName: 'Demo Operator',
};

let presetCounter = 0;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setEvaluator: (patch) => set((s) => ({ evaluator: { ...s.evaluator, ...patch } })),
      setMode: (mode) => set({ mode }),
      setLighting: (lighting) => set({ lighting }),
      setPrivacySilhouettes: (privacySilhouettes) => set({ privacySilhouettes }),
      setRetentionDays: (retentionDays) => set({ retentionDays }),
      setAlertEnabled: (t, v) => set((s) => ({ enabledAlerts: { ...s.enabledAlerts, [t]: v } })),
      setLowConfidenceHandling: (lowConfidenceHandling) => set({ lowConfidenceHandling }),
      savePreset: (p) => {
        presetCounter += 1;
        const preset: CalibrationPreset = { ...p, id: `CAL-${Date.now().toString(36)}-${presetCounter}`, createdAt: new Date().toISOString() };
        set((s) => ({ presets: [...s.presets, preset], activePresetByRide: { ...s.activePresetByRide, [p.rideId]: preset.id } }));
        return preset;
      },
      deletePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id), activePresetByRide: Object.fromEntries(Object.entries(s.activePresetByRide).map(([k, v]) => [k, v === id ? undefined : v])) })),
      setActivePreset: (rideId, id) => set((s) => ({ activePresetByRide: { ...s.activePresetByRide, [rideId]: id } })),
      setReviewerName: (reviewerName) => set({ reviewerName }),
      resetSettings: () => set({ ...defaults }),
    }),
    {
      name: 'rideops.settings.v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
