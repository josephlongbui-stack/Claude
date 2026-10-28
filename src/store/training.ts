import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TrainingLabel } from '@/data/training';

interface TrainingState {
  corrections: Record<string, { label: TrainingLabel; note: string; reviewer: string; at: string }>;
  setCorrection: (sampleId: string, label: TrainingLabel, note: string, reviewer: string) => void;
  clearCorrection: (sampleId: string) => void;
  resetCorrections: () => void;
}

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set) => ({
      corrections: {},
      setCorrection: (id, label, note, reviewer) => set((s) => ({ corrections: { ...s.corrections, [id]: { label, note, reviewer, at: new Date().toISOString() } } })),
      clearCorrection: (id) => set((s) => {
        const next = { ...s.corrections };
        delete next[id];
        return { corrections: next };
      }),
      resetCorrections: () => set({ corrections: {} }),
    }),
    { name: 'rideops.training.v1', storage: createJSONStorage(() => localStorage) },
  ),
);
