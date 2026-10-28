import { create } from 'zustand';
import type { EvaluatorSettings } from '@/domain/types';
import { DEFAULT_EVALUATOR_SETTINGS } from '@/domain/observation/evaluator';

interface SettingsState {
  evaluator: EvaluatorSettings;
  reviewerName: string;
  setEvaluator: (patch: Partial<EvaluatorSettings>) => void;
  resetSettings: () => void;
}

/** Session-only settings: every page load starts from the same defaults. */
export const useSettingsStore = create<SettingsState>()((set) => ({
  evaluator: DEFAULT_EVALUATOR_SETTINGS,
  reviewerName: 'Demo Operator',
  setEvaluator: (patch) => set((s) => ({ evaluator: { ...s.evaluator, ...patch } })),
  resetSettings: () => set({ evaluator: DEFAULT_EVALUATOR_SETTINGS }),
}));
