import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRecordsStore } from '@/store/records';
import type { RideConfiguration } from '@/domain/types';
import { historicalDispatches } from '@/data/history';
import { compareScenarios, mean, type ThroughputInputs, type ThroughputResult } from '@/domain/analytics/dispatch';
import { Badge, Notice, Panel, Slider, StatTile, num, pct } from '@/components/ui';

const HOURS = 10;

function ResultCard({ title, r }: { title: string; r: ThroughputResult }) {
  const limit = r.bottleneck === 'block' ? 'track limits it' : r.bottleneck === 'demand' ? 'demand limits it' : 'station limits it';
  return (
    <div className="rounded border border-graphite-700 bg-graphite-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold">{title}</span>
        <Badge tone={r.bottleneck === 'station' ? 'teal' : 'amber'}>{limit}</Badge>
      </div>
      <div className="text-2xl font-semibold num">
        {num(r.hourlyThroughput)} <span className="text-[12px] font-normal text-graphite-300">riders / hour</span>
      </div>
      <div className="text-[11.5px] text-graphite-300 mt-1">
        A train every {num(r.effectiveIntervalSec)} s · {num(r.dispatchesPerHour, 1)} per hour · {num(r.dailyThroughput)} per {HOURS}-hour day
      </div>
    </div>
  );
}

export function DispatchTab({ ride }: { ride: RideConfiguration }) {
  const sessionDispatches = useRecordsStore((s) => s.dispatches);
  const dispatches = useMemo(() => [...historicalDispatches(ride.id), ...sessionDispatches.filter((d) => d.rideId === ride.id)], [ride.id, sessionDispatches]);
  const recent = dispatches.slice(-20);
  const avgDwell = mean(dispatches.map((d) => d.dwellSec));
  const avgInterval = mean(dispatches.map((d) => d.intervalSec));
  const avgLoad = mean(dispatches.map((d) => d.loadFactor));
  const ridersPerHour = avgInterval ? (mean(dispatches.map((d) => d.riders)) * 3600) / avgInterval : 0;

  // What-if inputs start from the brief's illustrative numbers.
  const [capacity, setCapacity] = useState(ride.baseline.capacity);
  const [minCycle, setMinCycle] = useState(ride.baseline.minCycleSec);
  const [todayDwell, setTodayDwell] = useState(Math.max(ride.baseline.stationDwellSec, 30));
  const [assistDwell, setAssistDwell] = useState(Math.max(Math.round(ride.baseline.stationDwellSec * 0.79), 30));
  const [todayFill, setTodayFill] = useState(0.85);
  const [assistFill, setAssistFill] = useState(0.92);
  const [demand, setDemand] = useState(ride.baseline.demandPerHour);
  const today: ThroughputInputs = { capacity, stationDwellSec: todayDwell, minCycleSec: minCycle, loadFactor: todayFill, operatingHours: HOURS, demandPerHour: demand };
  const assisted: ThroughputInputs = { ...today, stationDwellSec: assistDwell, loadFactor: assistFill };
  const cmp = compareScenarios(today, assisted);
  const effects = [
    { name: 'Faster loading', value: Math.round(cmp.dispatchEffect) },
    { name: 'Fuller trains', value: Math.round(cmp.fillEffect) },
    { name: 'Both together', value: Math.round(cmp.interaction) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label="Time in station" value={`${num(avgDwell)} s`} sub="average" />
        <StatTile label="Dispatch every" value={`${num(avgInterval)} s`} sub="average" tone="teal" />
        <StatTile label="Riders per hour" value={num(ridersPerHour)} />
        <StatTile label="Seats filled" value={pct(avgLoad)} />
      </div>
      <Panel title="Time in station, last 20 dispatches" bodyClassName="p-2 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={recent.map((d, i) => ({ n: i + 1, Unloading: d.unloadSec, Loading: d.loadSec, Checks: d.reviewSec }))}>
            <CartesianGrid stroke="#212a37" vertical={false} />
            <XAxis dataKey="n" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={32} unit="s" />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend />
            <Bar isAnimationActive={false} dataKey="Unloading" stackId="a" fill="#8794a5" />
            <Bar isAnimationActive={false} dataKey="Loading" stackId="a" fill="#22d3ee" />
            <Bar isAnimationActive={false} dataKey="Checks" stackId="a" fill="#a78bfa" radius={[3, 3, 0, 0]} />
            <ReferenceLine y={ride.baseline.minCycleSec} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'track minimum', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
      <Panel title="What if loading were faster? (projection)" bodyClassName="p-3">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-3">
              <Slider label="Time in station today" value={todayDwell} min={30} max={240} step={1} onChange={setTodayDwell} format={(v) => `${v} s`} />
              <Slider label="With RideOps" value={assistDwell} min={30} max={240} step={1} onChange={setAssistDwell} format={(v) => `${v} s`} />
              <Slider label="Seats filled today" value={todayFill} min={0.4} max={1} step={0.01} onChange={setTodayFill} format={(v) => pct(v)} />
              <Slider label="With RideOps" value={assistFill} min={0.4} max={1} step={0.01} onChange={setAssistFill} format={(v) => pct(v)} />
            </div>
            <Slider label="Seats per train" value={capacity} min={4} max={40} step={1} onChange={setCapacity} />
            <Slider label="Shortest time between trains (track)" value={minCycle} min={20} max={200} step={1} onChange={setMinCycle} format={(v) => `${v} s`} />
            <Slider label="Riders wanting to ride, per hour" value={demand} min={100} max={2500} step={10} onChange={setDemand} />
          </div>
          <div className="col-span-12 lg:col-span-8 grid grid-cols-12 gap-3 content-start">
            <div className="col-span-12 md:col-span-6">
              <ResultCard title="Today" r={cmp.baseline} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <ResultCard title="With RideOps" r={cmp.assisted} />
            </div>
            <div className="col-span-12 md:col-span-6 h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={effects} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid stroke="#212a37" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={96} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v) => [`${v} riders / hour`, 'Change']} />
                  <Bar isAnimationActive={false} dataKey="value" fill="#4ade80" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-12 md:col-span-6 flex flex-col gap-2 text-[11.5px]">
              <div className="text-[13px]">
                <span className="font-semibold text-signal-green">
                  {cmp.deltaHourly >= 0 ? '+' : ''}
                  {num(cmp.deltaHourly)} riders / hour
                </span>{' '}
                <span className="text-graphite-300">({cmp.deltaPct >= 0 ? '+' : ''}{pct(cmp.deltaPct, 1)})</span>
              </div>
              <div className="text-graphite-300">A train leaves every max(station time, track minimum). Riders per hour = seats × seats filled × 3600 ÷ that interval, capped by demand.</div>
              {cmp.assisted.blockLimited && assistDwell < minCycle && <Notice tone="warn">The track minimum ({minCycle} s) is the limit, so faster loading can't send trains more often. Only fuller trains help.</Notice>}
              {cmp.assisted.bottleneck === 'demand' && <Notice>Demand is the limit: extra capacity would go unused.</Notice>}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
