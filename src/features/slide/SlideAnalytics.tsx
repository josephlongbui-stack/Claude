import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { Panel, StatTile } from '@/components/ui';
import { mean } from '@/domain/analytics/dispatch';
import { fmtDuration } from '@/domain/simulation/clock';
import { historicalDispatches, hourlyBuckets } from '@/data/history';

const C = { teal: '#22d3ee', amber: '#f59e0b', red: '#ef4444', slate: '#8794a5', violet: '#a78bfa' };

export function SlideAnalytics() {
  const slide = useSimulationStore((s) => s.slide);
  const simMs = useSimulationStore((s) => s.simMs);
  const alerts = useRecordsStore((s) => s.alerts);
  const exitReviews = useMemo(() => alerts.filter((a) => a.rideId === 'typhoon' && a.type === 'exit_zone_occupied'), [alerts]);

  const intervals = useMemo(() => slide.departures.slice(1).map((d, i) => ({ n: `#${i + 2}`, sec: (d - slide.departures[i]) / 1000 })), [slide.departures]);
  const avgInterval = intervals.length ? mean(intervals.map((i) => i.sec)) : 0;
  const ridersPerHour = avgInterval > 0 ? 3600 / avgInterval : 0;
  const baseline = useMemo(() => hourlyBuckets(historicalDispatches('typhoon')).map((b) => ({ hour: b.hour, riders: b.riders })), []);
  const queueSeries = useMemo(() => slide.queueHistory.map((q) => ({ t: fmtDuration(q.atMs), len: q.length })), [slide.queueHistory]);
  const occupancySeries = useMemo(() => {
    const ev = [...slide.departures.map((t) => ({ t, d: 1 })), ...slide.exits.map((t) => ({ t, d: -1 }))].sort((a, b) => a.t - b.t);
    let n = 0;
    const out = [{ t: '00:00', occ: 0 }];
    for (const e of ev) {
      n += e.d;
      out.push({ t: fmtDuration(e.t), occ: Math.max(0, n) });
    }
    out.push({ t: fmtDuration(simMs), occ: Math.max(0, n) });
    return out;
  }, [slide.departures, slide.exits, simMs]);

  const bottleneck = slide.exitZone.prolonged ? 'Exit-zone clearance (human review)' : slide.queue.length >= 3 && slide.entryReview === 'pending' ? 'Platform entry review' : slide.queue.length >= 3 ? 'Platform throughput (queue building)' : 'None observed';
  const tone = slide.exitZone.prolonged ? 'red' : slide.queue.length >= 3 ? 'amber' : 'green';

  return (
    <div className="grid grid-cols-12 gap-3">
      <StatTile className="col-span-6 md:col-span-2" label="Avg dispatch interval" value={avgInterval ? `${avgInterval.toFixed(1)}s` : '—'} sub={`${intervals.length} intervals this session`} />
      <StatTile className="col-span-6 md:col-span-2" label="Riders / hour (projected)" value={ridersPerHour ? Math.round(ridersPerHour) : '—'} sub="3600 ÷ mean interval" tone="teal" />
      <StatTile className="col-span-6 md:col-span-2" label="Queue length" value={slide.queue.length} sub={`${slide.platformRider ? '1 at platform' : 'platform clear'}`} />
      <StatTile className="col-span-6 md:col-span-2" label="Slide occupancy" value={slide.inFlume.length + (slide.exitZone.riderId ? 1 : 0)} sub={`${slide.inFlume.length} in flume · ${slide.exitZone.riderId ? '1' : '0'} in exit zone`} />
      <StatTile className="col-span-6 md:col-span-2" label="Exit-zone review events" value={exitReviews.length} sub={`${exitReviews.filter((a) => a.status === 'open' || a.status === 'acknowledged').length} open`} tone={exitReviews.some((a) => a.status === 'open') ? 'amber' : 'neutral'} />
      <StatTile className="col-span-6 md:col-span-2" label="Current bottleneck" value={<span className="text-[13px] leading-tight">{bottleneck}</span>} tone={tone} />

      <Panel title="Simulated dispatch intervals (this session)" className="col-span-12 md:col-span-4" bodyClassName="p-2 h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={intervals.length ? intervals : [{ n: '—', sec: 0 }]}>
            <CartesianGrid stroke="#212a37" vertical={false} />
            <XAxis dataKey="n" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={28} unit="s" />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar isAnimationActive={false} dataKey="sec" name="Interval (s)" fill={C.teal} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="Riders per hour — synthetic day so far" className="col-span-12 md:col-span-4" bodyClassName="p-2 h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={baseline}>
            <CartesianGrid stroke="#212a37" vertical={false} />
            <XAxis dataKey="hour" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={30} />
            <Tooltip />
            <Area isAnimationActive={false} dataKey="riders" name="Riders" stroke={C.teal} fill={C.teal} fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="Queue length & slide occupancy (this session)" className="col-span-12 md:col-span-4" bodyClassName="p-2 h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergeSeries(queueSeries, occupancySeries)}>
            <CartesianGrid stroke="#212a37" vertical={false} />
            <XAxis dataKey="t" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={24} allowDecimals={false} />
            <Tooltip />
            <Line isAnimationActive={false} type="stepAfter" dataKey="len" name="Queue" stroke={C.amber} dot={false} connectNulls />
            <Line isAnimationActive={false} type="stepAfter" dataKey="occ" name="Occupancy" stroke={C.violet} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

function mergeSeries(a: { t: string; len: number }[], b: { t: string; occ: number }[]): { t: string; len?: number; occ?: number }[] {
  const map = new Map<string, { t: string; len?: number; occ?: number }>();
  for (const x of a) map.set(x.t, { ...(map.get(x.t) ?? { t: x.t }), len: x.len });
  for (const x of b) map.set(x.t, { ...(map.get(x.t) ?? { t: x.t }), occ: x.occ });
  return [...map.values()].sort((x, y) => x.t.localeCompare(y.t));
}
