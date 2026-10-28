import { create } from 'zustand';
import { MAINTENANCE_TICKETS, type MaintenanceTicket } from '@/data/maintenance';

interface MaintenanceState {
  tickets: MaintenanceTicket[];
  notes: Record<string, string>;
  setStatus: (id: string, status: MaintenanceTicket['status'], note?: string) => void;
  setNote: (id: string, note: string) => void;
  resetTickets: () => void;
}

export const useMaintenanceStore = create<MaintenanceState>()((set) => ({
  tickets: MAINTENANCE_TICKETS,
  notes: {},
  setStatus: (id, status, note) => set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, status, resolution: note ?? t.resolution } : t)) })),
  setNote: (id, note) => set((s) => ({ notes: { ...s.notes, [id]: note } })),
  resetTickets: () => set({ tickets: MAINTENANCE_TICKETS, notes: {} }),
}));
