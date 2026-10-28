import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { getRide } from '@/domain/rides/configs';
import { historicalDispatches, hourlyBuckets } from '@/data/history';
import { compareScenarios, computeThroughput, histogram, mean, percentile, stddev, type ThroughputInputs } from '@/domain/analytics/dispatch';
import { forecastPacing } from '@/domain/analytics/pacing';
import { Badge, Notice, Panel, SectionTitle, Slider, StatTile, num, pct } from '@/components/ui';
import { AgentCard } from '@/components/AgentCard';

const C = { teal: '#22d3ee', amber: '#f59e0b', red: '#ef4444', slate: '#8794a5', violet: '#a78bfa', green: '#4ade80', blue: '#38bdf8' };

export default function DispatchAnalytics() {
  const rideId = useSimulationStore((s) => s.rideId);
  const phase = useSimulationStore((s) => s.phase);
  const phaseStartedMs = useSimulationStore((s) => s.phaseStartedMs);
  const simMs = useSimulationStore((s) => s.simMs);
  const sessionDispatches = useRecordsStore((s) => s.dispatches);
  const ride = getRide(rideId);

  const dispatches = useMemo(() => [...historicalDispatches(rideId), ...sessionDispatches.filter((d) => d.rideId === rideId)], [rideId, sessionDispatches]);
  const recent = dispatches.slice(-24);
  const stats = useMemo(() => {
    const dwell = dispatches.map((d) => d.dwellSec);
    return {
      dwell: mean(dwell),
      unload: mean(dispatches.map((d) => d.unloadSec)),
      load: mean(dispatches.map((d) => d.loadSec)),
      review: mean(dispatches.map((d) => d.reviewSec)),
      blockWait: mean(dispatches.map((d) => d.blockWaitSec)),
      interval: mean(dispatches.map((d) => d.intervalSec)),
      intervalSd: stddev(dispatches.map((d) => d.intervalSec)),
      p90: percentile(dispatches.map((d) => d.intervalSec), 90),
      empty: mean(dispatches.map((d) => d.emptySeats)),
      lf: mean(dispatches.map((d) => d.loadFactor)),
      ridersPerHour: dispatches.length ? (mean(dispatches.map((d) => d.riders)) * 3600) / Math.max(1, mean(dispatches.map((d) => d.intervalSec))) : 0,
    };
  }, [dispatches]);
  const buckets = useMemo(() => hourlyBuckets(dispatches), [dispatches]);
  const hist = useMemo(() => histogram(dispatches.map((d) => d.intervalSec), 10), [dispatches]);
  const theoretical = computeThroughput({ capacity: ride.baseline.capacity, stationDwellSec: ride.baseline.minCycleSec, minCycleSec: ride.baseline.minCycleSec, loadFactor: 1, operatingHours: 10, demandPerHour: 1e9 });

  // Baseline vs assisted simulator
  const [capacity, setCapacity] = useState(ride.baseline.capacity);
  const [baseDwell, setBaseDwell] = useState(120);
  const [assistDwell, setAssistDwell] = useState(95);
  const [minCycle, setMinCycle] = useState(ride.baseline.minCycleSec);
  const [baseLf, setBaseLf] = useState(0.85);
  const [assistLf, setAssistLf] = useState(0.92);
  const [hours, setHours] = useState(10);
  const [demand, setDemand] = useState(ride.baseline.demandPerHour);
  const baseline: ThroughputInputs = { capacity, stationDwellSec: baseDwell, minCycleSec: minCycle, loadFactor: baseLf, operatingHours: hours, demandPerHour: demand };
  const assisted: ThroughputInputs = { ...baseline, stationDwellSec: assistDwell, loadFactor: assistLf };
  const cmp = useMemo(() => compareScenarios(baseline, assisted), [capacity, baseDwell, assistDwell, minCycle, baseLf, assistLf, hours, demand]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmpData = [
    { name: 'Baseline', riders: Math.round(cmp.baseline.hourlyThroughput), capacity: Math.round(cmp.baseline.hourlyCapacity) },
    { name: 'Assisted', riders: Math.round(cmp.assisted.hourlyThroughput), capacity: Math.round(cmp.assisted.hourlyCapacity) },
  ];
  const effectData = [
    { name: 'Dispatch frequency', value: Math.round(cmp.dispatchEffect) },
    { name: 'Seat fill', value: Math.round(cmp.fillEffect) },
    { name: 'Interaction', value: Math.round(cmp.interaction) },
    { name: 'Total', value: Math.round(cmp.deltaHourly) },
  ];

  // Pacing agent
  const elapsed = phase === 'idle' || phase === 'departing' || phase === 'block_wait' ? 0 : (simMs - phaseStartedMs) / 1000 + (phase === 'boarding' ? 20 : phase === 'observing' ? 55 : phase === 'review' ? 70 : phase === 'ready' ? 100 : phase === 'dispatch' ? 115 : 0);
  const pacing = forecastPacing(ride, { elapsedSec: elapsed, dwellSec: stats.dwell || ride.baseline.stationDwellSec });

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub={`${ride.name} · synthetic operating day plus dispatches recorded in this session. All figures are scenario projections, not measured customer results.`}>Dispatch Analytics</SectionTitle>
      <div className="grid grid-cols-12 gap-2">
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Station dwell" value={`${num(stats.dwell)}s`} sub="avg" />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Unloading" value={`${num(stats.unload)}s`} />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Loading" value={`${num(stats.load)}s`} />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Review phase" value={`${num(stats.review)}s`} />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Block wait" value={`${num(stats.blockWait)}s`} sub={stats.blockWait > 5 ? 'block-limited' : 'station-limited'} tone={stats.blockWait > 5 ? 'amber' : 'neutral'} />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-2" label="Dispatch interval" value={`${num(stats.interval)}s`} sub={`σ ${num(stats.intervalSd, 1)}s · p90 ${num(stats.p90)}s`} tone="teal" />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Riders / hour" value={num(stats.ridersPerHour)} sub={`theoretical ${num(theoretical.theoreticalMaxPerHour)}`} />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Empty seats" value={num(stats.empty, 1)} sub="per dispatch" tone={stats.empty > ride.baseline.capacity * 0.15 ? 'amber' : 'neutral'} />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-1" label="Load factor" value={pct(stats.lf)} />
        <StatTile className="col-span-6 md:col-span-3 xl:col-span-2" label="Utilisation" value={pct(stats.ridersPerHour / Math.max(1, theoretical.theoreticalMaxPerHour))} sub="actual ÷ theoretical" />
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Panel title="Station dwell breakdown — last 24 dispatches" className="col-span-12 xl:col-span-5" bodyClassName="p-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recent.map((d, i) => ({ n: i + 1, Unload: d.unloadSec, Load: d.loadSec, Review: d.reviewSec, 'Block wait': d.blockWaitSec, session: d.scenarioId !== 'history' }))}>
              <CartesianGrid stroke="#212a37" vertical={false} />
              <XAxis dataKey="n" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={30} unit="s" />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="Unload" stackId="a" fill={C.slate} />
              <Bar isAnimationActive={false} dataKey="Load" stackId="a" fill={C.teal} />
              <Bar isAnimationActive={false} dataKey="Review" stackId="a" fill={C.violet} />
              <Bar isAnimationActive={false} dataKey="Block wait" stackId="a" fill={C.amber} radius={[3, 3, 0, 0]} />
              <ReferenceLine y={ride.baseline.minCycleSec} stroke={C.red} strokeDasharray="4 4" label={{ value: 'min cycle', fill: C.red, fontSize: 10, position: 'insideTopRight' }} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Dispatch interval distribution" className="col-span-12 md:col-span-6 xl:col-span-3" bodyClassName="p-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hist}>
              <CartesianGrid stroke="#212a37" vertical={false} />
              <XAxis dataKey="bin" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={24} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar isAnimationActive={false} dataKey="count" name="Dispatches" fill={C.teal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Riders per hour & utilisation over the day" className="col-span-12 md:col-span-6 xl:col-span-4" bodyClassName="p-2 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={buckets.map((b) => ({ hour: b.hour, riders: b.riders, utilisation: Math.round(b.utilization * 100) }))}>
              <CartesianGrid stroke="#212a37" vertical={false} />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tickLine={false} axisLine={false} width={36} />
              <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={30} unit="%" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Area isAnimationActive={false} yAxisId="l" dataKey="riders" name="Riders / h" stroke={C.teal} fill={C.teal} fillOpacity={0.15} />
              <Line isAnimationActive={false} yAxisId="r" dataKey="utilisation" name="Utilisation %" stroke={C.amber} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Baseline vs assisted operations simulator — scenario projection" bodyClassName="p-3">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-2.5">
            <Slider label="Train capacity (seats)" value={capacity} min={4} max={40} step={1} onChange={setCapacity} />
            <Slider label="Minimum ride-cycle / block interval" value={minCycle} min={30} max={200} step={1} onChange={setMinCycle} format={(v) => `${v}s`} />
            <div className="grid grid-cols-2 gap-3">
              <Slider label="Baseline station dwell" value={baseDwell} min={30} max={240} step={1} onChange={setBaseDwell} format={(v) => `${v}s`} />
              <Slider label="Assisted station dwell" value={assistDwell} min={30} max={240} step={1} onChange={setAssistDwell} format={(v) => `${v}s`} />
              <Slider label="Baseline load factor" value={baseLf} min={0.4} max={1} step={0.01} onChange={setBaseLf} format={(v) => pct(v)} />
              <Slider label="Assisted load factor" value={assistLf} min={0.4} max={1} step={0.01} onChange={setAssistLf} format={(v) => pct(v)} />
            </div>
            <Slider label="Operating hours / day" value={hours} min={4} max={16} step={0.5} onChange={setHours} format={(v) => `${v}h`} />
            <Slider label="Queue demand (riders / hour)" value={demand} min={100} max={2500} step={10} onChange={setDemand} />
            <Notice>
              Effective interval = max(station dwell, min cycle). Hourly capacity = capacity × load factor × 3600 ÷ interval. Throughput = min(capacity, demand).
            </Notice>
          </div>
          <div className="col-span-12 lg:col-span-8 grid grid-cols-12 gap-3">
            {[cmp.baseline, cmp.assisted].map((r, i) => (
              <div key={i} className="col-span-12 md:col-span-6 rounded border border-graphite-700 bg-graphite-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold">{i === 0 ? 'Baseline' : 'Assisted'}</span>
                  <Badge tone={r.bottleneck === 'block' ? 'amber' : r.bottleneck === 'demand' ? 'violet' : 'teal'}>{r.bottleneck === 'block' ? 'block-limited' : r.bottleneck === 'demand' ? 'demand-limited' : 'station-limited'}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                  <span className="text-graphite-300">Effective interval</span><span className="mono text-right">{num(r.effectiveIntervalSec)}s</span>
                  <span className="text-graphite-300">Dispatches / hour</span><span className="mono text-right">{num(r.dispatchesPerHour, 1)}</span>
                  <span className="text-graphite-300">Hourly capacity</span><span className="mono text-right">{num(r.hourlyCapacity)}</span>
                  <span className="text-graphite-300">Throughput (demand-capped)</span><span className="mono text-right font-semibold">{num(r.hourlyThroughput)} / h</span>
                  <span className="text-graphite-300">Daily throughput</span><span className="mono text-right">{num(r.dailyThroughput)}</span>
                </div>
              </div>
            ))}
            <div className="col-span-12 md:col-span-6 h-[190px]">
              <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">Hourly throughput vs capacity</div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={cmpData}>
                  <CartesianGrid stroke="#212a37" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend />
                  <Bar isAnimationActive={false} dataKey="capacity" name="Hourly capacity" fill={C.slate} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="riders" name="Throughput" fill={C.teal} radius={[3, 3, 0, 0]} />
                  <ReferenceLine y={demand} stroke={C.violet} strokeDasharray="4 4" label={{ value: 'demand', fill: C.violet, fontSize: 10, position: 'insideTopRight' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-12 md:col-span-6 h-[190px]">
              <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mb-1">Separate effects (riders / hour)</div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={effectData} layout="vertical">
                  <CartesianGrid stroke="#212a37" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={110} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar isAnimationActive={false} dataKey="value" name="Δ riders / h" fill={C.green} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-12 text-[11.5px] text-graphite-200 flex flex-col gap-1">
              <div>
                <Badge tone="teal">Projected change</Badge> {cmp.deltaHourly >= 0 ? '+' : ''}{num(cmp.deltaHourly)} riders / hour ({cmp.deltaPct >= 0 ? '+' : ''}{pct(cmp.deltaPct, 1)}), {cmp.deltaDaily >= 0 ? '+' : ''}{num(cmp.deltaDaily)} per day under the stated assumptions.
              </div>
              {cmp.assisted.blockLimited && assistDwell < minCycle && (
                <Notice tone="warn">Block interval ({minCycle}s) is already the bottleneck: reducing station dwell below it does not increase dispatch frequency. Only the seat-fill effect applies.</Notice>
              )}
              {cmp.assisted.bottleneck === 'demand' && <Notice>Demand ({num(demand)}/h) caps throughput — additional capacity would not be used at this demand level.</Notice>}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-12 gap-3">
        <AgentCard n={2} name="Pacing" purpose="Forecasts when simulated station readiness and downstream block availability may align. Informational only — no dispatch command is sent or suggested." className="col-span-12 xl:col-span-7">
          <div className="h-[170px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pacing.points}>
                <CartesianGrid stroke="#212a37" vertical={false} />
                <XAxis dataKey="t" tickLine={false} axisLine={false} unit="s" />
                <YAxis tickLine={false} axisLine={false} width={30} domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                <Tooltip formatter={(v) => `${Math.round(Number(v) * 100)}%`} />
                <Legend />
                <Line isAnimationActive={false} type="monotone" dataKey="stationReady" name="Station readiness (projected)" stroke={C.teal} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="blockReady" name="Block availability (projected)" stroke={C.amber} dot={false} />
                <ReferenceLine x={Math.round(pacing.alignedAtSec / 5) * 5} stroke={C.green} strokeDasharray="4 4" label={{ value: 'aligned', fill: C.green, fontSize: 10 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[11.5px] mt-1 flex items-center gap-2 flex-wrap">
            <Badge tone={pacing.limiting === 'station' ? 'teal' : pacing.limiting === 'block' ? 'amber' : 'green'}>{pacing.limiting === 'station' ? 'station is pacing constraint' : pacing.limiting === 'block' ? 'block is pacing constraint' : 'aligned'}</Badge>
            <span className="text-graphite-200">{pacing.note}</span>
          </div>
        </AgentCard>
        <Panel title="Station bottleneck detection" className="col-span-12 xl:col-span-5" bodyClassName="p-3 text-[11.5px] flex flex-col gap-2">
          {(() => {
            const parts = [
              { k: 'Loading', v: stats.load },
              { k: 'Review / inspection', v: stats.review },
              { k: 'Unloading', v: stats.unload },
              { k: 'Block wait', v: stats.blockWait },
            ].sort((a, b) => b.v - a.v);
            return (
              <>
                {parts.map((p) => (
                  <div key={p.k} className="flex items-center gap-2">
                    <span className="w-32 text-graphite-300">{p.k}</span>
                    <span className="flex-1 h-2 bg-graphite-700 rounded overflow-hidden">
                      <span className="block h-full bg-signal-teal" style={{ width: `${(p.v / Math.max(1, stats.dwell + stats.blockWait)) * 100}%` }} />
                    </span>
                    <span className="mono w-12 text-right">{num(p.v)}s</span>
                  </div>
                ))}
                <div className="text-graphite-200 mt-1">
                  Largest share of the cycle: <strong>{parts[0].k}</strong>. {stats.blockWait > 5 ? 'The block interval is binding — station improvements will not shorten the dispatch interval.' : 'The station is binding — loading and review time drive the dispatch interval.'}
                </div>
              </>
            );
          })()}
        </Panel>
      </div>
    </div>
  );
}
