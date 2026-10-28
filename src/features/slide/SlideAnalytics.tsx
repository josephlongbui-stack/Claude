import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { Panel, StatTile } from '@/components/ui';
import { mean } from '@/domain/analytics/dispatch';

/** Throughput for this session, computed from the recorded departures, exits and queue changes. */
export function SlideAnalytics() {
  const slide = useSimulationStore((s) => s.slide);
  const simMs = useSimulationStore((s) => s.simMs);

  const intervals = useMemo(() => slide.departures.slice(1).map((d, i) => (d - slide.departures[i]) / 1000), [slide.departures]);
  const avgInterval = intervals.length ? mean(intervals) : 0;
  const series = useMemo(() => {
    // One point per second: queue length and riders on the slide (in the flume or the exit zone).
    const points: { t: number; queue: number; onSlide: number }[] = [];
    const last = Math.floor(simMs / 1000);
    for (let t = 0; t <= last; t += 1) {
      const ms = t * 1000;
      const queue = [...slide.queueHistory].reverse().find((q) => q.atMs <= ms)?.length ?? 0;
      const onSlide = slide.departures.filter((d) => d <= ms).length - slide.exits.filter((x) => x <= ms).length;
      points.push({ t, queue, onSlide: Math.max(0, onSlide) });
    }
    return points;
  }, [slide.queueHistory, slide.departures, slide.exits, simMs]);

  const bottleneck = slide.exitZone.prolonged ? 'Exit zone (waiting on a person)' : slide.queue.length >= 3 ? 'Start platform' : 'None';

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 xl:col-span-5 grid grid-cols-2 gap-2 content-start">
        <StatTile label="Time between riders" value={avgInterval ? `${avgInterval.toFixed(1)} s` : '—'} sub={`${slide.departures.length} departure${slide.departures.length === 1 ? '' : 's'} so far`} />
        <StatTile label="Riders per hour" value={avgInterval ? Math.round(3600 / avgInterval) : '—'} sub="3600 ÷ time between riders" tone="teal" />
        <StatTile label="Waiting in line" value={slide.queue.length} sub={slide.platformRider ? '1 more at the top' : 'platform clear'} />
        <StatTile label="Holding things up" value={<span className="text-[14px]">{bottleneck}</span>} tone={slide.exitZone.prolonged ? 'red' : bottleneck === 'None' ? 'green' : 'amber'} />
      </div>
      <Panel title="Line length and riders on the slide" className="col-span-12 xl:col-span-7" bodyClassName="p-2 h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid stroke="#212a37" vertical={false} />
            <XAxis dataKey="t" tickLine={false} axisLine={false} unit="s" />
            <YAxis tickLine={false} axisLine={false} width={24} allowDecimals={false} />
            <Tooltip labelFormatter={(t) => `${t} s`} />
            <Legend />
            <Line isAnimationActive={false} type="stepAfter" dataKey="queue" name="In line" stroke="#f59e0b" dot={false} />
            <Line isAnimationActive={false} type="stepAfter" dataKey="onSlide" name="On the slide" stroke="#a78bfa" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
