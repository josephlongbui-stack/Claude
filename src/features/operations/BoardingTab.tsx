import { useState } from 'react';
import { RefreshCw, Wand2 } from 'lucide-react';
import { useBoardingStore, boardingRows, BOARDING_RIDE_ID } from '@/store/boarding';
import { getRide } from '@/domain/rides/configs';
import type { AllocationResult, Party } from '@/domain/analytics/boarding';
import { Notice, Panel, StatTile, Toggle, pct } from '@/components/ui';

const PARTY_COLORS = ['#22d3ee', '#a78bfa', '#f59e0b', '#4ade80', '#f472b6', '#fb923c', '#38bdf8', '#facc15', '#2dd4bf', '#c084fc', '#f87171', '#86efac'];
const colorFor = (partyId: string): string => PARTY_COLORS[(Number(partyId.replace(/\D/g, '')) || 0) % PARTY_COLORS.length];

function RowsGrid({ result, title, onDropParty }: { result: AllocationResult | null; title: string; onDropParty?: (partyId: string, row: number) => void }) {
  const [over, setOver] = useState<number | null>(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-[11px]">
        <span className="font-semibold text-graphite-200">{title}</span>
        {result && <span className={result.emptySeats ? 'text-signal-amber' : 'text-signal-green'}>{result.emptySeats} empty seats</span>}
      </div>
      <div className="flex flex-col gap-1">
        {boardingRows().map((r) => {
          const owner: Record<number, string> = {};
          for (const a of result?.assignments.filter((x) => x.row === r.row) ?? []) for (const s of a.seats) owner[s] = a.partyId;
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
              <span className="text-[10px] text-graphite-400 w-11 shrink-0 whitespace-nowrap">Row {r.row}</span>
              {Array.from({ length: r.seats }, (_, i) => i + 1).map((s) => (
                <div key={s} className="h-6 flex-1 rounded text-[9.5px] mono flex items-center justify-center" style={{ background: owner[s] ? colorFor(owner[s]) : '#1a212d', color: owner[s] ? '#07090d' : '#5b6878', border: '1px solid #2c3645' }}>
                  {owner[s] ?? '·'}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PartyChip({ p, row, waiting, onToggle }: { p: Party; row?: number; waiting: boolean; onToggle: () => void }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData('text/party', p.id)} className={`rounded border px-2 py-1.5 flex items-center gap-2 cursor-grab ${waiting ? 'border-signal-amber-dim' : 'border-graphite-700'} bg-graphite-800`} title="Drag onto a row to place this group yourself">
      <span className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: colorFor(p.id), color: '#07090d' }}>
        {p.size}
      </span>
      <div className="flex-1 min-w-0 text-[11.5px]">
        {p.id} · group of {p.size}
        {row !== undefined && <span className="text-graphite-400"> → Row {row}</span>}
        {waiting && <span className="text-signal-amber"> · next train</span>}
      </div>
      {p.size > 1 && (
        <button className={`badge ${p.together ? 'badge-teal' : 'badge-slate'}`} onClick={onToggle} title="Must this group sit together?">
          {p.together ? 'together' : 'can split'}
        </button>
      )}
    </div>
  );
}

export function BoardingTab() {
  const b = useBoardingStore();
  const [error, setError] = useState<string | null>(null);
  const ride = getRide(BOARDING_RIDE_ID);
  const result = b.optimized;

  const onDrop = (partyId: string, row: number): void => {
    const p = b.parties.find((x) => x.id === partyId);
    if (!p) return;
    if (p.size > ride.geometry.seatsPerRow) {
      setError(`${partyId} has ${p.size} people, more than one row holds. The allocator seats them across two rows next to each other.`);
      return;
    }
    setError(null);
    b.assignManual(partyId, row);
    b.optimize();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-graphite-300 max-w-3xl">Groups waiting for {ride.name} ({ride.geometry.rows} rows of {ride.geometry.seatsPerRow}). Filling rows in arrival order leaves gaps; the allocator packs groups into rows without splitting any group that must sit together.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label="Seats filled, arrival order" value={pct(b.naive.loadFactor)} sub={`${b.naive.emptySeats} empty`} />
        <StatTile label="Seats filled, allocator" value={result ? pct(result.loadFactor) : '—'} sub={result ? `${result.emptySeats} empty` : 'press Fill the train'} tone={result ? 'teal' : 'neutral'} />
        <StatTile label="Seats gained" value={result ? `+${result.seatsUsed - b.naive.seatsUsed}` : '—'} sub="this train" tone={result && result.seatsUsed > b.naive.seatsUsed ? 'green' : 'neutral'} />
        <StatTile label="Groups split" value={result ? result.splitParties : '—'} sub="only groups that can split" />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel title={`Waiting · ${b.parties.length} groups`} className="col-span-12 lg:col-span-4" bodyClassName="p-2 flex flex-col gap-2">
          <div className="flex gap-1.5 flex-wrap">
            <button
              className="btn btn-primary"
              onClick={() => {
                b.optimize();
                setError(null);
              }}
            >
              <Wand2 size={13} /> Fill the train
            </button>
            <button
              className="btn"
              onClick={() => {
                b.regenerate();
                setError(null);
              }}
              title="New set of groups"
            >
              <RefreshCw size={13} /> New queue
            </button>
          </div>
          <Toggle label="Single-rider line" checked={b.singleRider} onChange={b.setSingleRider} hint="Single riders fill the last gaps." />
          {error && <Notice tone="warn">{error}</Notice>}
          <div className="flex flex-col gap-1.5 overflow-auto max-h-[420px]">
            {b.parties.map((p) => (
              <PartyChip key={p.id} p={p} row={result?.assignments.find((a) => a.partyId === p.id)?.row} waiting={result ? result.unassigned.some((u) => u.id === p.id) : false} onToggle={() => b.toggleTogether(p.id)} />
            ))}
          </div>
        </Panel>
        <Panel title="Rows" className="col-span-12 lg:col-span-8" bodyClassName="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <RowsGrid result={b.naive} title="Arrival order" />
          <RowsGrid result={result} title={result ? 'Allocator (drop a group on a row to override)' : 'Allocator — press Fill the train'} onDropParty={onDrop} />
          {result && (
            <details className="md:col-span-2 text-[11px]">
              <summary className="cursor-pointer text-graphite-300">Why each group went where it did</summary>
              <ol className="mt-1 divide-y divide-graphite-750">
                {result.decisions.map((d, i) => (
                  <li key={i} className="py-1">
                    {d}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </Panel>
      </div>
    </div>
  );
}
