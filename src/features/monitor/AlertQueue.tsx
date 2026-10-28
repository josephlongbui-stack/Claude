import { useMemo, useState } from 'react';
import { BellOff } from 'lucide-react';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { AlertCard } from './AlertCard';
import { EmptyState, Panel } from '@/components/ui';
import { isOpen } from '@/domain/review/workflow';
import type { Alert } from '@/domain/types';

export function AlertQueue({ rideId, onInspect }: { rideId: string; onInspect: (a: Alert) => void }) {
  const alerts = useRecordsStore((s) => s.alerts);
  const [showClosed, setShowClosed] = useState(false);
  const list = useMemo(() => {
    const mine = alerts.filter((a) => a.rideId === rideId);
    const open = mine.filter(isOpen).sort((a, b) => b.createdMs - a.createdMs);
    const closed = mine.filter((a) => !isOpen(a)).sort((a, b) => b.updatedMs - a.updatedMs).slice(0, 12);
    return showClosed ? [...open, ...closed] : open;
  }, [alerts, rideId, showClosed]);
  const openCount = list.filter(isOpen).length;
  const sessionMs = useSimulationStore((s) => s.sessionMs);
  void sessionMs;

  return (
    <Panel
      title={
        <>
          Alerts & human review <span className="badge badge-amber ml-1">{openCount} open</span>
        </>
      }
      actions={
        <label className="flex items-center gap-1 text-[11px] text-graphite-300">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> show closed
        </label>
      }
      bodyClassName="p-2 overflow-y-auto"
      className="h-full"
    >
      {list.length === 0 ? (
        <EmptyState icon={<BellOff size={20} />} title="No alerts for this ride" hint="Run a scenario or inject a condition from the uncertainty controls. Alerts appear here, on the seat map, in camera overlays and in the evidence log." />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((a) => (
            <AlertCard key={a.id} alert={a} onInspect={onInspect} />
          ))}
        </div>
      )}
    </Panel>
  );
}
