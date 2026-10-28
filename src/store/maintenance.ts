import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MAINTENANCE_TICKETS, type MaintenanceTicket } from '@/data/maintenance';

interface MaintenanceState {
  tickets: MaintenanceTicket[];
  surfacedId: string | null;
  notes: Record<string, string>;
  surfaceTicket: (id: string) => void;
  setStatus: (id: string, status: MaintenanceTicket['status'], note?: string) => void;
  setNote: (id: string, note: string) => void;
  resetTickets: () => void;
}

export const useMaintenanceStore = create<MaintenanceState>()(
  persist(
    (set) => ({
      tickets: MAINTENANCE_TICKETS,
      surfacedId: null,
      notes: {},
      surfaceTicket: (id) => set((s) => ({ surfacedId: id, tickets: s.tickets.map((t) => (t.id === id && t.status === 'draft' ? { ...t, status: 'open' } : t)) })),
      setStatus: (id, status, note) => set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, status, resolution: note ?? t.resolution } : t)) })),
      setNote: (id, note) => set((s) => ({ notes: { ...s.notes, [id]: note } })),
      resetTickets: () => set({ tickets: MAINTENANCE_TICKETS, surfacedId: null, notes: {} }),
    }),
    { name: 'rideops.maintenance.v1', storage: createJSONStorage(() => localStorage), partialize: (s) => ({ tickets: s.tickets, notes: s.notes }) },
  ),
);
