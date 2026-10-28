import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Eye } from 'lucide-react';
import { useMaintenanceStore } from '@/store/maintenance';
import { useSimulationStore } from '@/store/simulation';
import { EVIDENCE_SERIES, type MaintenanceTicket } from '@/data/maintenance';
import { linearTrend } from '@/domain/analytics/maintenance';
import { getRide } from '@/domain/rides/configs';
import { Badge, Panel, num } from '@/components/ui';

const statusTone = (s: MaintenanceTicket['status']): 'amber' | 'teal' | 'green' => (s === 'open' ? 'amber' : s === 'in_review' ? 'teal' : 'green');

export function MaintenanceTab() {
  const tickets = useMaintenanceStore((s) => s.tickets);
  const notes = useMaintenanceStore((s) => s.notes);
  const setStatus = useMaintenanceStore((s) => s.setStatus);
  const setNote = useMaintenanceStore((s) => s.setNote);
  const gates = useSimulationStore((s) => s.gates);
  const [selectedId, setSelectedId] = useState(tickets[0].id);
  const t = tickets.find((x) => x.id === selectedId) ?? tickets[0];
  const series = EVIDENCE_SERIES[t.evidenceSeries];
  const trend = useMemo(() => linearTrend([...series.data], series.threshold, series.higherIsWorse), [series]);
  const slowGates = gates.filter((g) => g.openDurationMs > 5000);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-graphite-300 max-w-3xl">Trends from 14 simulated days of equipment readings. These are illustrations, not validated predictive maintenance.</p>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Tickets" className="col-span-12 lg:col-span-4" bodyClassName="p-0">
          <ul className="divide-y divide-graphite-750">
            {tickets.map((x) => (
              <li key={x.id}>
                <button className={`w-full text-left px-3 py-2 hover:bg-graphite-800 ${x.id === t.id ? 'bg-graphite-800' : ''}`} onClick={() => setSelectedId(x.id)}>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10.5px] text-graphite-400">{x.id}</span>
                    <Badge tone={x.priority.startsWith('P1') ? 'red' : x.priority.startsWith('P2') ? 'amber' : 'slate'}>{x.priority.split(' · ')[0]}</Badge>
                    <Badge tone={statusTone(x.status)}>{x.status.replace('_', ' ')}</Badge>
                  </div>
                  <div className="text-[12px] font-medium mt-0.5">{x.title}</div>
                  <div className="text-[10.5px] text-graphite-400">{getRide(x.rideId).name}</div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={`${t.id} · ${t.title}`} className="col-span-12 lg:col-span-8" bodyClassName="p-3 flex flex-col gap-3">
          <div className="h-[220px]">
            <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">{series.label}</div>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={series.data.map((d) => ({ day: `Day ${d.day}`, value: Number(d.value.toFixed(2)), trend: Number((trend.intercept + trend.slopePerDay * d.day).toFixed(2)) }))}>
                <CartesianGrid stroke="#212a37" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} interval={1} />
                <YAxis tickLine={false} axisLine={false} width={34} />
                <Tooltip />
                <Line isAnimationActive={false} dataKey="value" name="Reading" stroke="#22d3ee" dot={{ r: 2 }} />
                <Line isAnimationActive={false} dataKey="trend" name="Trend" stroke="#f59e0b" strokeDasharray="4 4" dot={false} />
                <ReferenceLine y={series.threshold} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'limit', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">What changed</div>
              <p>{t.finding}</p>
              <p className="text-graphite-300 mt-1">
                Trend {trend.slopePerDay >= 0 ? '+' : ''}
                {num(trend.slopePerDay, 2)} {series.unit} per day{trend.crossesThresholdOnDay !== null ? ` · crosses the limit around day ${trend.crossesThresholdOnDay}` : ''}.
              </p>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">Recommended</div>
              <p>{t.recommendation}</p>
              {t.evidenceSeries === 'gateB' && (
                <p className="text-graphite-300 mt-1">{slowGates.length ? `This session also logged ${slowGates.length} slow Gate B opening${slowGates.length === 1 ? '' : 's'} (scenario F).` : 'Run the Slow gate scenario on Vortex Run to add a live reading.'}</p>
              )}
            </div>
          </div>
          <textarea className="textarea" placeholder="Technician note" value={notes[t.id] ?? ''} onChange={(e) => setNote(t.id, e.target.value)} aria-label="Technician note" />
          {t.resolution && <p className="text-[11.5px] text-graphite-300">Closed: {t.resolution}</p>}
          <div className="flex gap-1.5 flex-wrap">
            <button className="btn" disabled={t.status !== 'open'} onClick={() => setStatus(t.id, 'in_review')}>
              <Eye size={13} /> Start review
            </button>
            <button className="btn btn-primary" disabled={t.status === 'closed'} onClick={() => setStatus(t.id, 'closed', notes[t.id] || 'Closed by technician.')}>
              <CheckCircle2 size={13} /> Close ticket
            </button>
            {t.status === 'closed' && (
              <button className="btn btn-ghost" onClick={() => setStatus(t.id, 'open')}>
                Reopen
              </button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
