import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { useMaintenanceStore } from '@/store/maintenance';
import { PARK_BY_ID, ridesForPark } from '@/domain/rides/configs';
import { historicalDispatches, parkOccupancyTrend } from '@/data/history';
import { computeThroughput, mean } from '@/domain/analytics/dispatch';
import { isOpen } from '@/domain/review/workflow';
import { Badge, Panel, SectionTitle, StatTile, num, pct } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';

const C = { teal: '#22d3ee', amber: '#f59e0b', violet: '#a78bfa', slate: '#8794a5' };

export default function ParkOverview() {
  const parkId = useSimulationStore((s) => s.parkId);
  const currentRideId = useSimulationStore((s) => s.rideId);
  const alerts = useRecordsStore((s) => s.alerts);
  const events = useRecordsStore((s) => s.events);
  const tickets = useMaintenanceStore((s) => s.tickets);
  const navigate = useNavigate();
  const park = PARK_BY_ID[parkId];
  const rides = useMemo(() => ridesForPark(parkId), [parkId]);

  const perRide = useMemo(
    () =>
      rides.map((r) => {
        const h = historicalDispatches(r.id);
        const interval = mean(h.map((d) => d.intervalSec));
        const lf = mean(h.map((d) => d.loadFactor));
        const riders = h.reduce((a, d) => a + d.riders, 0);
        const theo = computeThroughput({ capacity: r.baseline.capacity, stationDwellSec: r.baseline.minCycleSec, minCycleSec: r.baseline.minCycleSec, loadFactor: 1, operatingHours: 1, demandPerHour: 1e9 }).theoreticalMaxPerHour;
        const ridersPerHour = interval ? (mean(h.map((d) => d.riders)) * 3600) / interval : 0;
        return { ride: r, interval, lf, riders, ridersPerHour, utilization: theo ? ridersPerHour / theo : 0, open: alerts.filter((a) => a.rideId === r.id && isOpen(a)).length, tickets: tickets.filter((t) => t.rideId === r.id && t.status !== 'closed').length };
      }),
    [rides, alerts, tickets],
  );
  const trend = useMemo(() => parkOccupancyTrend(parkId), [parkId]);
  const totals = {
    riders: perRide.reduce((a, r) => a + r.riders, 0),
    interval: mean(perRide.map((r) => r.interval)),
    ridersPerHour: perRide.reduce((a, r) => a + r.ridersPerHour, 0),
    open: perRide.reduce((a, r) => a + r.open, 0),
    tickets: perRide.reduce((a, r) => a + r.tickets, 0),
  };
  const recent = events.filter((e) => rides.some((r) => r.id === e.rideId)).slice(-10).reverse();

  const openRide = (rideId: string): void => {
    const r = rides.find((x) => x.id === rideId);
    useSimulationStore.getState().setRide(rideId, { autoplay: true });
    navigate(r?.geometry.kind === 'slide' ? '/water-slide' : '/live-monitor');
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub={`${park.name} · ${park.location} · fictional park with synthetic operating data. Click an attraction to open its monitor.`}>Park Overview</SectionTitle>
      <div className="grid grid-cols-12 gap-2">
        <StatTile className="col-span-6 md:col-span-4 xl:col-span-2" label="Attractions monitored" value={rides.length} sub={`${rides.filter((r) => r.status === 'operating').length} operating (simulated)`} />
        <StatTile className="col-span-6 md:col-span-4 xl:col-span-2" label="Simulated rider flow" value={num(totals.ridersPerHour)} sub="riders / hour, all monitored rides" tone="teal" />
        <StatTile className="col-span-6 md:col-span-4 xl:col-span-2" label="Avg dispatch interval" value={`${num(totals.interval)}s`} sub="across attractions" />
        <StatTile className="col-span-6 md:col-span-4 xl:col-span-2" label="Throughput today" value={num(totals.riders)} sub="riders since 10:00 (synthetic)" />
        <StatTile className="col-span-6 md:col-span-4 xl:col-span-2" label="Outstanding reviews" value={totals.open} tone={totals.open ? 'amber' : 'green'} sub="open / acknowledged alerts" />
        <StatTile className="col-span-6 md:col-span-4 xl:col-span-2" label="Maintenance tickets" value={totals.tickets} sub="open on this park's rides" tone={totals.tickets ? 'amber' : 'neutral'} />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Attractions" className="col-span-12 xl:col-span-7" bodyClassName="p-0 overflow-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Attraction</th>
                <th>Type</th>
                <th>Status</th>
                <th>Interval</th>
                <th>Load</th>
                <th>Riders / h</th>
                <th>Util.</th>
                <th>Reviews</th>
                <th>Tickets</th>
              </tr>
            </thead>
            <tbody>
              {perRide.map(({ ride, interval, lf, ridersPerHour, utilization, open, tickets: tk }) => (
                <tr key={ride.id} className={`cursor-pointer ${ride.id === currentRideId ? 'selected' : ''}`} onClick={() => openRide(ride.id)} title={`Open ${ride.name} monitor`}>
                  <td className="font-medium">{ride.name}</td>
                  <td className="text-graphite-300">{ride.typeLabel}</td>
                  <td>
                    <Badge tone={ride.status === 'operating' ? 'green' : ride.status === 'delayed' ? 'amber' : ride.status === 'maintenance' ? 'violet' : 'slate'}>{ride.status}</Badge>
                  </td>
                  <td className="mono">{num(interval)}s</td>
                  <td className="mono">{pct(lf)}</td>
                  <td className="mono">{num(ridersPerHour)}</td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <span className="w-14 h-1.5 bg-graphite-700 rounded overflow-hidden inline-block">
                        <span className="block h-full bg-signal-teal" style={{ width: `${Math.min(100, utilization * 100)}%` }} />
                      </span>
                      <span className="mono">{pct(utilization)}</span>
                    </span>
                  </td>
                  <td>{open ? <Badge tone="amber">{open}</Badge> : <span className="text-graphite-400">0</span>}</td>
                  <td>{tk ? <Badge tone="violet">{tk}</Badge> : <span className="text-graphite-400">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Park occupancy & rider flow — synthetic day" className="col-span-12 xl:col-span-5" bodyClassName="p-2 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <CartesianGrid stroke="#212a37" vertical={false} />
              <XAxis dataKey="time" tickLine={false} axisLine={false} interval={3} />
              <YAxis yAxisId="l" tickLine={false} axisLine={false} width={44} />
              <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={34} />
              <Tooltip />
              <Legend />
              <Area yAxisId="l" dataKey="occupancy" name="Park occupancy" stroke={C.violet} fill={C.violet} fillOpacity={0.12} />
              <Line yAxisId="r" dataKey="riders" name="Riders / 15 min" stroke={C.teal} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Ride performance comparison — riders per hour vs load factor" className="col-span-12 xl:col-span-7" bodyClassName="p-2 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perRide.map((r) => ({ name: r.ride.name, 'Riders / h': Math.round(r.ridersPerHour), 'Load factor %': Math.round(r.lf * 100) }))}>
              <CartesianGrid stroke="#212a37" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={34} domain={[0, 100]} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend />
              <Bar yAxisId="l" dataKey="Riders / h" fill={C.teal} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="r" dataKey="Load factor %" fill={C.amber} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Operational timeline — latest recorded events" className="col-span-12 xl:col-span-5" bodyClassName="p-0 overflow-auto max-h-[240px]">
          {recent.length === 0 ? (
            <div className="p-4 text-[11.5px] text-graphite-400">No events yet for this park. Open a ride monitor and run a scenario.</div>
          ) : (
            <table className="tbl">
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td className="mono text-graphite-300 w-16">{simClock(e.simMs)}</td>
                    <td className="w-28 text-graphite-300">{rides.find((r) => r.id === e.rideId)?.name}</td>
                    <td className={e.severity === 'concern' ? 'text-signal-red' : e.severity === 'review' ? 'text-signal-amber' : ''}>{e.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
