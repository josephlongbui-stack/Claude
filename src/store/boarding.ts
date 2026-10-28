import { create } from 'zustand';
import { naiveAllocation, optimizedAllocation, generateParties, type AllocationResult, type Party, type RowSpec } from '@/domain/analytics/boarding';
import { getRide } from '@/domain/rides/configs';

interface BoardingState {
  rideId: string;
  parties: Party[];
  singleRider: boolean;
  seed: number;
  manual: Record<string, number | undefined>;
  naive: AllocationResult | null;
  optimized: AllocationResult | null;
  setRide: (rideId: string) => void;
  regenerate: () => void;
  setSingleRider: (v: boolean) => void;
  toggleTogether: (partyId: string) => void;
  toggleAccessible: (partyId: string) => void;
  assignManual: (partyId: string, row: number | undefined) => void;
  optimize: () => void;
  computeNaive: () => void;
  reset: () => void;
}

export function rowsFor(rideId: string): RowSpec[] {
  const ride = getRide(rideId);
  const rows: RowSpec[] = [];
  for (let r = 1; r <= ride.geometry.rows; r += 1) rows.push({ row: r, seats: ride.geometry.seatsPerRow, accessible: r === 1 });
  return rows;
}

export const useBoardingStore = create<BoardingState>()((set, get) => ({
  rideId: 'vortex',
  parties: generateParties('vortex', 1),
  singleRider: true,
  seed: 1,
  manual: {},
  naive: null,
  optimized: null,
  setRide: (rideId) => {
    const parties = generateParties(rideId, get().seed);
    set({ rideId, parties, manual: {}, naive: naiveAllocation(rowsFor(rideId), parties), optimized: null });
  },
  regenerate: () => {
    const seed = get().seed + 1;
    const parties = generateParties(get().rideId, seed);
    set({ seed, parties, manual: {}, naive: naiveAllocation(rowsFor(get().rideId), parties), optimized: null });
  },
  setSingleRider: (singleRider) => set({ singleRider, optimized: null }),
  toggleTogether: (id) => set((s) => ({ parties: s.parties.map((p) => (p.id === id ? { ...p, together: !p.together } : p)), optimized: null })),
  toggleAccessible: (id) => set((s) => ({ parties: s.parties.map((p) => (p.id === id ? { ...p, accessible: !p.accessible } : p)), optimized: null })),
  assignManual: (partyId, row) => set((s) => ({ manual: { ...s.manual, [partyId]: row }, optimized: null })),
  computeNaive: () => set((s) => ({ naive: naiveAllocation(rowsFor(s.rideId), s.parties) })),
  optimize: () => {
    const s = get();
    const rows = rowsFor(s.rideId);
    set({ naive: naiveAllocation(rows, s.parties), optimized: optimizedAllocation(rows, s.parties, { singleRider: s.singleRider, manual: s.manual }) });
  },
  reset: () => {
    const parties = generateParties('vortex', 1);
    set({ rideId: 'vortex', seed: 1, parties, manual: {}, singleRider: true, naive: naiveAllocation(rowsFor('vortex'), parties), optimized: null });
  },
}));
