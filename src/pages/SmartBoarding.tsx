import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Wand2 } from 'lucide-react';
import { useBoardingStore, rowsFor } from '@/store/boarding';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import type { AllocationResult, Party } from '@/domain/analytics/boarding';
import { Badge, Notice, Panel, SectionTitle, StatTile, Toggle, pct } from '@/components/ui';
import { AgentCard } from '@/components/AgentCard';

const PARTY_COLORS = ['#22d3ee', '#a78bfa', '#f59e0b', '#4ade80', '#f472b6', '#fb923c', '#38bdf8', '#facc15', '#2dd4bf', '#c084fc', '#f87171', '#86efac', '#67e8f9', '#fcd34d', '#e879f9', '#a3e635'];

function colorFor(partyId: string): string {
  const n = Number(partyId.replace(/\D/g, '')) || 0;
  return PARTY_COLORS[n % PARTY_COLORS.length];
}

function AllocationGrid({ result, rideId, title, onDropParty, manual }: { result: AllocationResult | null; rideId: string; title: string; onDropParty?: (partyId: string, row: number) => void; manual?: Record<string, number | undefined> }) {
  const rows = rowsFor(rideId);
  const [over, setOver] = useState<number | null>(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-graphite-200">{title}</span>
        {result && (
          <span className="text-[11px] text-graphite-300">
            {result.seatsUsed}/{result.totalSeats} seats · <span className={result.emptySeats ? 'text-signal-amber' : 'text-signal-green'}>{result.emptySeats} empty</span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => {
          const inRow = result?.assignments.filter((a) => a.row === r.row) ?? [];
          const seatOwner: Record<number, string> = {};
          for (const a of inRow) for (const s of a.seats) seatOwner[s] = a.partyId;
          return (
            <div
              key={r.row}
              className={`flex items-center gap-1.5 rounded border px-2 py-1 ${over === r.row ? 'border-signal-teal bg-graphite-750' : 'border-graphite-700 bg-graphite-850'}`}
              onDragOver={(e) => {
                if (!onDropParty) return;
                e.preventDefault();
                setOver(r.row);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                if (!onDropParty) return;
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/party');
                if (id) onDropParty(id, r.row);
              }}
            >
              <span className="text-[10px] text-graphite-400 w-12 shrink-0 whitespace-nowrap">Row {r.row}{r.accessible ? ' ♿' : ''}</span>
              {Array.from({ length: r.seats }, (_, i) => i + 1).map((s) => {
                const owner = seatOwner[s];
                return (
                  <div key={s} className="h-6 flex-1 rounded text-[9.5px] mono flex items-center justify-center" style={{ background: owner ? colorFor(owner) : '#1a212d', color: owner ? '#07090d' : '#5b6878', border: owner && manual?.[owner] !== undefined ? '2px solid #fff' : '1px solid #2c3645' }} title={owner ? `${owner} (${manual?.[owner] !== undefined ? 'manual' : 'allocated'})` : 'empty'}>
                    {owner ?? '·'}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PartyChip({ p, onToggleTogether, onToggleAccessible, assignedRow, waiting }: { p: Party; onToggleTogether: () => void; onToggleAccessible: () => void; assignedRow?: number; waiting?: boolean }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData('text/party', p.id)} className={`rounded border px-2 py-1.5 flex items-center gap-2 cursor-grab active:cursor-grabbing ${waiting ? 'border-signal-amber-dim' : 'border-graphite-700'} bg-graphite-800`} title="Drag onto a row to assign manually">
      <span className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold" style={{ background: colorFor(p.id), color: '#07090d' }}>
        {p.size}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-medium">
          {p.id} · party of {p.size} {assignedRow !== undefined && <span className="text-graphite-400">→ Row {assignedRow}</span>}
          {waiting && <span className="text-signal-amber"> · waits</span>}
        </div>
        <div className="flex gap-1 mt-0.5">
          <button className={`badge ${p.together ? 'badge-teal' : 'badge-slate'}`} onClick={onToggleTogether} disabled={p.size === 1} title="Toggle the party-together constraint">
            {p.size === 1 ? 'single' : p.together ? 'together' : 'may split'}
          </button>
          <button className={`badge ${p.accessible ? 'badge-violet' : 'badge-slate'}`} onClick={onToggleAccessible} title="Accessible boarding requirement (manual operational constraint)">
            {p.accessible ? 'accessible' : 'standard'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SmartBoarding() {
  const simRideId = useSimulationStore((s) => s.rideId);
  const b = useBoardingStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ride = getRide(simRideId);
    const target = ride.geometry.kind === 'slide' ? 'vortex' : simRideId;
    if (b.rideId !== target) b.setRide(target);
    else if (!b.naive) b.computeNaive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simRideId]);

  const ride = getRide(b.rideId);
  const totalRiders = useMemo(() => b.parties.reduce((a, p) => a + p.size, 0), [b.parties]);
  const result = b.optimized;
  const naive = b.naive;
  const assignedRow = (id: string): number | undefined => result?.assignments.find((a) => a.partyId === id)?.row;

  const onDrop = (partyId: string, row: number): void => {
    const p = b.parties.find((x) => x.id === partyId);
    if (!p) return;
    if (p.size > ride.geometry.seatsPerRow) {
      setError(`${partyId} (party of ${p.size}) is larger than one row — the allocator places it across adjacent rows.`);
      return;
    }
    setError(null);
    b.assignManual(partyId, row);
    b.optimize();
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Row assignment computed from a fictional party queue. Capacity gains are measured by the allocator, not asserted. Nothing here dispatches or controls a ride.">Smart Boarding · {ride.name}</SectionTitle>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Inputs" className="col-span-12 lg:col-span-3" bodyClassName="p-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <div className="rounded border border-graphite-700 p-2">
              <div className="text-graphite-400 text-[10px] uppercase tracking-wider">Seats</div>
              <div className="num text-lg font-semibold">{ride.geometry.rows * ride.geometry.seatsPerRow}</div>
            </div>
            <div className="rounded border border-graphite-700 p-2">
              <div className="text-graphite-400 text-[10px] uppercase tracking-wider">Rows × seats</div>
              <div className="num text-lg font-semibold">{ride.geometry.rows} × {ride.geometry.seatsPerRow}</div>
            </div>
            <div className="rounded border border-graphite-700 p-2">
              <div className="text-graphite-400 text-[10px] uppercase tracking-wider">Parties waiting</div>
              <div className="num text-lg font-semibold">{b.parties.length}</div>
            </div>
            <div className="rounded border border-graphite-700 p-2">
              <div className="text-graphite-400 text-[10px] uppercase tracking-wider">Riders waiting</div>
              <div className="num text-lg font-semibold">{totalRiders}</div>
            </div>
          </div>
          <Toggle label="Single-rider line available" checked={b.singleRider} onChange={b.setSingleRider} hint="Singles back-fill remaining seats after parties are placed." />
          <div className="text-[11px] text-graphite-300">Party-together and accessible constraints are toggled on each party chip. Accessible parties are placed on Row 1 as a manual operational constraint.</div>
          <div className="flex gap-1.5">
            <button className="btn btn-primary" onClick={() => { b.optimize(); setError(null); }}>
              <Wand2 size={13} /> Generate Better Assignment
            </button>
            <button className="btn" onClick={() => { b.regenerate(); setError(null); }} title="New fictional party queue">
              <RefreshCw size={13} />
            </button>
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
        </Panel>

        <Panel title="Station queue · drag a party onto a row to assign manually" className="col-span-12 lg:col-span-4" bodyClassName="p-2 overflow-auto max-h-[520px]">
          <div className="flex flex-col gap-1.5">
            {b.parties.map((p) => (
              <PartyChip key={p.id} p={p} onToggleTogether={() => b.toggleTogether(p.id)} onToggleAccessible={() => b.toggleAccessible(p.id)} assignedRow={assignedRow(p.id)} waiting={result ? result.unassigned.some((u) => u.id === p.id) : false} />
            ))}
          </div>
        </Panel>

        <Panel title="Row assignments" className="col-span-12 lg:col-span-5" bodyClassName="p-3 grid grid-cols-2 gap-3">
          <AllocationGrid result={naive} rideId={b.rideId} title="Naive — arrival order" />
          <AllocationGrid result={result} rideId={b.rideId} title={result ? 'Optimized — RideOps allocator' : 'Optimized — not generated yet'} onDropParty={onDrop} manual={b.manual} />
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <StatTile className="col-span-6 md:col-span-2" label="Naive load factor" value={naive ? pct(naive.loadFactor) : '—'} sub={naive ? `${naive.emptySeats} empty seats` : ''} />
        <StatTile className="col-span-6 md:col-span-2" label="Optimized load factor" value={result ? pct(result.loadFactor) : '—'} sub={result ? `${result.emptySeats} empty seats` : 'generate to compute'} tone={result ? 'teal' : 'neutral'} />
        <StatTile className="col-span-6 md:col-span-2" label="Seats recovered" value={result && naive ? `+${result.seatsUsed - naive.seatsUsed}` : '—'} sub="per dispatch, this queue" tone={result && naive && result.seatsUsed > naive.seatsUsed ? 'green' : 'neutral'} />
        <StatTile className="col-span-6 md:col-span-2" label="Parties waiting" value={result ? result.unassigned.length : naive ? naive.unassigned.length : '—'} sub={naive ? `naive: ${naive.unassigned.length}` : ''} />
        <StatTile className="col-span-6 md:col-span-2" label="Boarding time estimate" value={result ? `${result.boardingTimeSec}s` : naive ? `${naive.boardingTimeSec}s` : '—'} sub={naive && result ? `naive ${naive.boardingTimeSec}s` : 'simulated model'} />
        <StatTile className="col-span-6 md:col-span-2" label="Parties split" value={result ? result.splitParties : '—'} sub="only parties marked “may split”" />
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Panel title="Allocator decisions (transparent log)" className="col-span-12 lg:col-span-7" bodyClassName="p-0 overflow-auto max-h-[300px]">
          {!result ? (
            <div className="p-4 text-[11.5px] text-graphite-400">Click “Generate Better Assignment” to compute a real allocation from the queue above.</div>
          ) : (
            <ol className="text-[11px] divide-y divide-graphite-750">
              {result.decisions.map((d, i) => (
                <li key={i} className="px-3 py-1.5 flex gap-2">
                  <span className="mono text-graphite-400 w-5 shrink-0">{i + 1}</span>
                  <span>{d}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <AgentCard n={1} name="Batching" purpose="Optimises row/seat allocation from party sizes while honouring together and accessibility constraints." className="col-span-12 lg:col-span-5">
          <ul className="text-[11px] text-graphite-200 list-disc pl-4 mt-1 flex flex-col gap-0.5">
            <li>Manual constraints first (operator drag-and-drop, accessible row).</li>
            <li>“Together” parties placed largest-first by best fit; parties larger than a row span adjacent rows and are never separated.</li>
            <li>Parties that may split fill the largest remaining gaps; singles back-fill last.</li>
            <li>Boarding time = 18s + 2.2s/party + 1.4s/rider + 4s/split + 6s/accessible (illustrative model).</li>
          </ul>
          {result && naive && (
            <div className="mt-2 text-[11px]">
              <Badge tone="teal">Scenario projection</Badge> Load factor {pct(naive.loadFactor)} → {pct(result.loadFactor)} for this queue. Repeated over a day this feeds the Dispatch Analytics seat-fill effect.
            </div>
          )}
        </AgentCard>
      </div>
    </div>
  );
}
