import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Eye } from 'lucide-react';
import { useMaintenanceStore } from '@/store/maintenance';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { EQUIPMENT_HEALTH, EVIDENCE_SERIES, anomalyHistory, type MaintenanceTicket } from '@/data/maintenance';
import { linearTrend } from '@/domain/analytics/maintenance';
import { getRide } from '@/domain/rides/configs';
import { Badge, Notice, Panel, SectionTitle, StatTile, num } from '@/components/ui';
import { AgentCard } from '@/components/AgentCard';
import { simClock } from '@/domain/simulation/clock';

const C = { teal: '#22d3ee', amber: '#f59e0b', red: '#ef4444', slate: '#8794a5', violet: '#a78bfa', green: '#4ade80' };

function statusTone(s: MaintenanceTicket['status']): 'teal' | 'amber' | 'red' | 'green' | 'slate' | 'violet' {
  return s === 'open' ? 'amber' : s === 'in_review' ? 'teal' : s === 'closed' ? 'green' : 'slate';
}

export default function PredictiveMaintenance() {
  const tickets = useMaintenanceStore((s) => s.tickets);
  const surfacedId = useMaintenanceStore((s) => s.surfacedId);
  const setStatus = useMaintenanceStore((s) => s.setStatus);
  const notes = useMaintenanceStore((s) => s.notes);
  const setNote = useMaintenanceStore((s) => s.setNote);
  const gates = useSimulationStore((s) => s.gates);
  const sessionMs = useSimulationStore((s) => s.sessionMs);
  const simMs = useSimulationStore((s) => s.simMs);
  const events = useRecordsStore((s) => s.events);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tickets.find((t) => t.id === (selectedId ?? surfacedId)) ?? tickets.find((t) => t.status !== 'closed') ?? tickets[0];
  const series = EVIDENCE_SERIES[selected.evidenceSeries];
  const trend = useMemo(() => linearTrend(series.data, series.threshold, selected.evidenceSeries !== 'cameraSharpness'), [series, selected.evidenceSeries]);
  const anomalies = useMemo(() => anomalyHistory(), []);
  const sessionGateEvents = events.filter((e) => e.type === 'observation' && e.target?.kind === 'equipment').slice(-6).reverse();
  const healthByCategory = useMemo(() => {
    const cats = ['gate', 'sensor', 'camera', 'cycle', 'equipment'] as const;
    return cats.map((c) => ({ name: c, health: Math.round((EQUIPMENT_HEALTH.filter((h) => h.category === c).reduce((a, h) => a + h.health, 0) / Math.max(1, EQUIPMENT_HEALTH.filter((h) => h.category === c).length)) * 100) }));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Fleet equipment health from 14 simulated days of synthetic measurements. Forecasts are illustrative trend lines and do not constitute validated predictive maintenance.">Predictive Maintenance</SectionTitle>
      <div className="grid grid-cols-12 gap-2">
        <StatTile className="col-span-6 md:col-span-3" label="P1 · inspect now" value={tickets.filter((t) => t.priority.startsWith('P1') && t.status !== 'closed').length} tone="red" />
        <StatTile className="col-span-6 md:col-span-3" label="P2 · schedule" value={tickets.filter((t) => t.priority.startsWith('P2') && t.status !== 'closed').length} tone="amber" />
        <StatTile className="col-span-6 md:col-span-3" label="P3 · monitor" value={tickets.filter((t) => t.priority.startsWith('P3') && t.status !== 'closed').length} />
        <StatTile className="col-span-6 md:col-span-3" label="Fleet health index" value={`${Math.round((EQUIPMENT_HEALTH.reduce((a, h) => a + h.health, 0) / EQUIPMENT_HEALTH.length) * 100)}%`} sub="mean of synthetic equipment scores" tone="teal" />
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Panel title="Fleet equipment health (synthetic)" className="col-span-12 xl:col-span-4" bodyClassName="p-0 overflow-auto max-h-[380px]">
          <table className="tbl">
            <thead>
              <tr>
                <th>Equipment</th>
                <th>Health</th>
                <th>Trend</th>
                <th>Last anomaly</th>
              </tr>
            </thead>
            <tbody>
              {[...EQUIPMENT_HEALTH].sort((a, b) => a.health - b.health).map((h) => (
                <tr key={h.id}>
                  <td>{h.label}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <span className="w-14 h-1.5 bg-graphite-700 rounded overflow-hidden inline-block">
                        <span className="block h-full" style={{ width: `${h.health * 100}%`, background: h.health < 0.5 ? C.red : h.health < 0.75 ? C.amber : C.green }} />
                      </span>
                      <span className="mono">{Math.round(h.health * 100)}</span>
                    </span>
                  </td>
                  <td><Badge tone={h.trend === 'falling' ? 'red' : h.trend === 'rising' ? 'green' : 'slate'}>{h.trend}</Badge></td>
                  <td className="text-graphite-300">{h.lastAnomalyDay ? `day ${h.lastAnomalyDay}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Maintenance tickets" className="col-span-12 xl:col-span-4" bodyClassName="p-0 overflow-auto max-h-[380px]">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Finding</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className={`cursor-pointer ${selected.id === t.id ? 'selected' : ''} ${surfacedId === t.id ? 'bg-amber-950/20' : ''}`} onClick={() => setSelectedId(t.id)}>
                  <td className="mono">{t.id}</td>
                  <td>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[10.5px] text-graphite-400">{getRide(t.rideId).name} · {t.equipmentId}</div>
                  </td>
                  <td><Badge tone={t.priority.startsWith('P1') ? 'red' : t.priority.startsWith('P2') ? 'amber' : 'slate'}>{t.priority.split(' · ')[0]}</Badge></td>
                  <td><Badge tone={statusTone(t.status)}>{t.status.replace('_', ' ')}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Health by category" className="col-span-12 xl:col-span-4" bodyClassName="p-2 h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={healthByCategory} layout="vertical">
              <CartesianGrid stroke="#212a37" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} unit="%" />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={70} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar isAnimationActive={false} dataKey="health" name="Health %" fill={C.teal} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Panel title={`${selected.id} · ${selected.title}`} className="col-span-12 xl:col-span-8" bodyClassName="p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={statusTone(selected.status)}>{selected.status.replace('_', ' ')}</Badge>
            <Badge tone={selected.priority.startsWith('P1') ? 'red' : selected.priority.startsWith('P2') ? 'amber' : 'slate'}>{selected.priority}</Badge>
            <Badge tone="slate">{getRide(selected.rideId).name} · {selected.equipmentId}</Badge>
            <Badge tone="slate">created day {selected.createdDay}</Badge>
            {surfacedId === selected.id && <Badge tone="teal">surfaced by scenario J</Badge>}
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 lg:col-span-7 h-[220px]">
              <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">{series.label} — 14 simulated days</div>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={series.data.map((d) => ({ day: `D${d.day}`, value: Number(d.value.toFixed(2)), trend: Number((trend.intercept + trend.slopePerDay * d.day).toFixed(2)) }))}>
                  <CartesianGrid stroke="#212a37" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={34} unit={series.unit === 's' ? 's' : ''} />
                  <Tooltip />
                  <Line isAnimationActive={false} dataKey="value" name={series.label} stroke={C.teal} dot={{ r: 2 }} />
                  <Line isAnimationActive={false} dataKey="trend" name="Linear trend" stroke={C.amber} strokeDasharray="4 4" dot={false} />
                  <ReferenceLine y={series.threshold} stroke={C.red} strokeDasharray="3 3" label={{ value: 'threshold', fill: C.red, fontSize: 10, position: 'insideTopLeft' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-12 lg:col-span-5 text-[11.5px] flex flex-col gap-2">
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">Finding</div>
                <div className="text-graphite-100">{selected.finding}</div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">Recommendation</div>
                <div className="text-graphite-100">{selected.recommendation}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] rounded border border-graphite-700 p-2">
                <span className="text-graphite-300">Trend slope</span><span className="mono text-right">{trend.slopePerDay >= 0 ? '+' : ''}{num(trend.slopePerDay, 3)} {series.unit}/day</span>
                <span className="text-graphite-300">Fit (R²)</span><span className="mono text-right">{num(trend.r2, 2)}</span>
                <span className="text-graphite-300">Latest</span><span className="mono text-right">{num(trend.latest, 2)} {series.unit}</span>
                <span className="text-graphite-300">Projected +7d</span><span className="mono text-right">{num(trend.projected7d, 2)} {series.unit}</span>
                <span className="text-graphite-300">Threshold crossing</span><span className="mono text-right">{trend.crossesThresholdOnDay === null ? 'not projected' : `day ${trend.crossesThresholdOnDay}`}</span>
              </div>
              {selected.resolution && <Notice>Resolution: {selected.resolution}</Notice>}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">Evidence attached from this session</div>
            {gates.length === 0 && sessionGateEvents.length === 0 ? (
              <div className="text-[11px] text-graphite-400">No gate observations recorded in this session yet. Run scenario F (slow station dispatch) to attach live evidence.</div>
            ) : (
              <ul className="text-[11px] flex flex-col gap-0.5">
                {gates.slice(-5).reverse().map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mono text-graphite-400">{simClock(sessionMs - (simMs - g.atMs))}</span>
                    <span>{g.gateId} opened in {(g.openDurationMs / 1000).toFixed(1)}s</span>
                    {g.openDurationMs > 5000 && <Badge tone="amber">above threshold</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <textarea className="textarea" placeholder="Technician note (stored locally)…" value={notes[selected.id] ?? ''} onChange={(e) => setNote(selected.id, e.target.value)} aria-label="Technician note" />
            <div className="flex gap-1.5 flex-wrap">
              <button className="btn" disabled={selected.status === 'in_review' || selected.status === 'closed'} onClick={() => setStatus(selected.id, 'in_review')}>
                <Eye size={13} /> Mark in review
              </button>
              <button className="btn btn-primary" disabled={selected.status === 'closed'} onClick={() => setStatus(selected.id, 'closed', notes[selected.id] || 'Closed by technician during simulated maintenance window.')}>
                <CheckCircle2 size={13} /> Close ticket
              </button>
              {selected.status === 'closed' && (
                <button className="btn btn-ghost" onClick={() => setStatus(selected.id, 'open')}>Reopen</button>
              )}
            </div>
          </div>
        </Panel>
        <AgentCard n={3} name="Fault Detection" purpose="Analyses fictional historical equipment observations and generates maintenance recommendations with supporting synthetic evidence." className="col-span-12 xl:col-span-4">
          <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mt-2 mb-1">Synthetic anomaly history (14 days)</div>
          <div className="overflow-auto max-h-[300px]">
            <table className="tbl">
              <tbody>
                {anomalies.slice(0, 24).map((a, i) => (
                  <tr key={i}>
                    <td className="mono text-graphite-400 w-10">D{a.day}</td>
                    <td className="text-graphite-300">{getRide(a.rideId).name}</td>
                    <td>{a.kind}</td>
                    <td className="mono">{a.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AgentCard>
      </div>
    </div>
  );
}
