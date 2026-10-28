import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { useMaintenanceStore } from '@/store/maintenance';
import { PARK, RIDES, isSlide } from '@/domain/rides/configs';
import { historicalDispatches, parkOccupancyTrend } from '@/data/history';
import { mean } from '@/domain/analytics/dispatch';
import { isOpen } from '@/domain/review/workflow';
import { Badge, Panel, SectionTitle, StatTile, num, pct } from '@/components/ui';
import { simClock } from '@/domain/simulation/clock';

export default function Overview() {
  const alerts = useRecordsStore((s) => s.alerts);
  const events = useRecordsStore((s) => s.events);
  const tickets = useMaintenanceStore((s) => s.tickets);
  const navigate = useNavigate();

  const perRide = useMemo(
    () =>
      RIDES.map((ride) => {
        const h = historicalDispatches(ride.id);
        const interval = mean(h.map((d) => d.intervalSec));
        return {
          ride,
          interval,
          loadFactor: mean(h.map((d) => d.loadFactor)),
          ridersPerHour: interval ? (mean(h.map((d) => d.riders)) * 3600) / interval : 0,
          toReview: alerts.filter((a) => a.rideId === ride.id && isOpen(a)).length,
        };
      }),
    [alerts],
  );
  const trend = useMemo(() => parkOccupancyTrend(), []);
  const ridersPerHour = perRide.reduce((a, r) => a + r.ridersPerHour, 0);
  const toReview = alerts.filter(isOpen).length;
  const openTickets = tickets.filter((t) => t.status !== 'closed').length;
  const recent = events.filter((e) => e.type !== 'phase').slice(-8).reverse();

  const openRide = (rideId: string): void => {
    useSimulationStore.getState().setRide(rideId);
    navigate(isSlide(rideId) ? '/water-slide' : '/live-monitor');
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub={`${PARK.location}. Pick a ride to watch its cameras.`}>{PARK.name}</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label="Rides monitored" value={RIDES.length} sub={`${RIDES.filter((r) => r.status === 'operating').length} operating`} />
        <StatTile label="Riders per hour" value={num(ridersPerHour)} sub="all monitored rides" tone="teal" />
        <StatTile label="To review" value={toReview} sub="camera flags waiting for a person" tone={toReview ? 'amber' : 'green'} />
        <StatTile label="Maintenance" value={openTickets} sub="open tickets" tone={openTickets ? 'amber' : 'neutral'} />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Rides" className="col-span-12 xl:col-span-7" bodyClassName="p-0 overflow-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ride</th>
                <th>Status</th>
                <th>Dispatch every</th>
                <th>Seats filled</th>
                <th>Riders / h</th>
                <th>To review</th>
              </tr>
            </thead>
            <tbody>
              {perRide.map(({ ride, interval, loadFactor, ridersPerHour: rph, toReview: n }) => (
                <tr key={ride.id} className="cursor-pointer" onClick={() => openRide(ride.id)} title={`Open ${ride.name}`}>
                  <td>
                    <div className="font-medium">{ride.name}</div>
                    <div className="text-[10.5px] text-graphite-400">{ride.typeLabel}</div>
                  </td>
                  <td>
                    <Badge tone={ride.status === 'operating' ? 'green' : 'amber'}>{ride.status}</Badge>
                  </td>
                  <td className="mono">{num(interval)} s</td>
                  <td className="mono">{pct(loadFactor)}</td>
                  <td className="mono">{num(rph)}</td>
                  <td>{n ? <Badge tone="amber">{n}</Badge> : <span className="text-graphite-400">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Guests in the park today" className="col-span-12 xl:col-span-5" bodyClassName="p-2 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <CartesianGrid stroke="#212a37" vertical={false} />
              <XAxis dataKey="time" tickLine={false} axisLine={false} interval={3} />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <Tooltip />
              <Area isAnimationActive={false} dataKey="occupancy" name="Guests" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.12} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <Panel title="Latest activity" bodyClassName="p-0 overflow-auto max-h-[260px]">
        {recent.length === 0 ? (
          <div className="p-4 text-[11.5px] text-graphite-400">Nothing yet. Open a ride and let a scenario run.</div>
        ) : (
          <table className="tbl">
            <tbody>
              {recent.map((e) => (
                <tr key={e.id}>
                  <td className="mono text-graphite-300 w-20">{simClock(e.simMs)}</td>
                  <td className="w-32 text-graphite-300">{RIDES.find((r) => r.id === e.rideId)?.name}</td>
                  <td className={e.severity === 'concern' ? 'text-signal-red' : e.severity === 'review' ? 'text-signal-amber' : ''}>{e.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
