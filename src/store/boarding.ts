import { create } from 'zustand';
import { naiveAllocation, optimizedAllocation, generateParties, type AllocationResult, type Party, type RowSpec } from '@/domain/analytics/boarding';
import { DEFAULT_RIDE_ID, getRide } from '@/domain/rides/configs';

/** Boarding is demonstrated on the flagship coaster. */
export const BOARDING_RIDE_ID = DEFAULT_RIDE_ID;

interface BoardingState {
  parties: Party[];
  seed: number;
  singleRider: boolean;
  manual: Record<string, number | undefined>;
  naive: AllocationResult;
  optimized: AllocationResult | null;
  regenerate: () => void;
  setSingleRider: (v: boolean) => void;
  toggleTogether: (partyId: string) => void;
  assignManual: (partyId: string, row: number | undefined) => void;
  optimize: () => void;
  reset: () => void;
}

export function boardingRows(): RowSpec[] {
  const g = getRide(BOARDING_RIDE_ID).geometry;
  return Array.from({ length: g.rows }, (_, i) => ({ row: i + 1, seats: g.seatsPerRow, accessible: i === 0 }));
}

function fresh(seed: number): Pick<BoardingState, 'parties' | 'seed' | 'manual' | 'naive' | 'optimized'> {
  const parties = generateParties(BOARDING_RIDE_ID, seed);
  return { seed, parties, manual: {}, naive: naiveAllocation(boardingRows(), parties), optimized: null };
}

export const useBoardingStore = create<BoardingState>()((set, get) => ({
  ...fresh(1),
  singleRider: true,
  regenerate: () => set(fresh(get().seed + 1)),
  setSingleRider: (singleRider) => set({ singleRider, optimized: null }),
  toggleTogether: (id) => {
    const parties = get().parties.map((p) => (p.id === id ? { ...p, together: !p.together } : p));
    set({ parties, naive: naiveAllocation(boardingRows(), parties), optimized: null });
  },
  assignManual: (partyId, row) => set((s) => ({ manual: { ...s.manual, [partyId]: row } })),
  optimize: () => {
    const s = get();
    set({ optimized: optimizedAllocation(boardingRows(), s.parties, { singleRider: s.singleRider, manual: s.manual }) });
  },
  reset: () => set({ ...fresh(1), singleRider: true }),
}));
