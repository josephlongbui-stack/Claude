import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { CERTIFICATIONS, COACHING_TOPICS, shiftStats } from '@/data/history';
import { getRide, ridesForPark } from '@/domain/rides/configs';
import { ALERT_TYPE_LABEL } from '@/domain/review/workflow';
import { mean, percentile } from '@/domain/analytics/dispatch';
import { Badge, Notice, Panel, SectionTitle, StatTile, num, pct } from '@/components/ui';
import { AgentCard } from '@/components/AgentCard';
import type { AlertType } from '@/domain/types';

const C = { teal: '#22d3ee', amber: '#f59e0b', violet: '#a78bfa', slate: '#8794a5', green: '#4ade80' };

export default function Workforce() {
  const alerts = useRecordsStore((s) => s.alerts);
  const parkId = useSimulationStore((s) => s.parkId);
  const rides = useMemo(() => ridesForPark(parkId), [parkId]);
  const shifts = useMemo(() => shiftStats().filter((s) => rides.some((r) => r.id === s.rideId)), [rides]);

  const sessionAck = alerts.filter((a) => a.status !== 'open').map((a) => (a.updatedMs - a.createdMs) / 1000);
  const completion = alerts.length ? alerts.filter((a) => a.status === 'reviewed' || a.status === 'false_alarm').length / alerts.length : 0;
  const byType = useMemo(() => {
    const m = new Map<AlertType, { n: number; ack: number[] }>();
    for (const a of alerts) {
      const e = m.get(a.type) ?? { n: 0, ack: [] };
      e.n += 1;
      if (a.status !== 'open') e.ack.push((a.updatedMs - a.createdMs) / 1000);
      m.set(a.type, e);
    }
    return [...m.entries()].map(([t, v]) => ({ type: ALERT_TYPE_LABEL[t], count: v.n, ack: v.ack.length ? Math.round(mean(v.ack)) : 0 })).sort((a, b) => b.count - a.count);
  }, [alerts]);
  const byShift = useMemo(() => ['Early (10:00–14:00)', 'Mid (14:00–18:00)', 'Late (18:00–close)'].map((shift) => {
    const rows = shifts.filter((s) => s.shift === shift);
    return { shift: shift.split(' ')[0], completed: rows.reduce((a, r) => a + r.reviewsCompleted, 0), open: rows.reduce((a, r) => a + r.reviewsOpen, 0), medianAck: Math.round(mean(rows.map((r) => r.medianAckSec))), p90: Math.round(mean(rows.map((r) => r.p90AckSec))) };
  }), [shifts]);

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Aggregate operational indicators for training and operational improvement. Fictional demonstration data; no facial recognition, identity tracking or individual performance profiling exists in this software.">Workforce & Training</SectionTitle>
      <Notice>Indicators are aggregated by shift and attraction, never by person. Review timings describe the workflow, not an individual.</Notice>
      <div className="grid grid-cols-12 gap-2">
        <StatTile className="col-span-6 md:col-span-3" label="Review completion (this session)" value={alerts.length ? pct(completion) : '—'} sub={`${alerts.length} alerts raised`} tone="teal" />
        <StatTile className="col-span-6 md:col-span-3" label="Median time to first action" value={sessionAck.length ? `${Math.round(percentile(sessionAck, 50))}s` : '—'} sub={sessionAck.length ? `p90 ${Math.round(percentile(sessionAck, 90))}s` : 'simulated clock'} />
        <StatTile className="col-span-6 md:col-span-3" label="Shift-level reviews (synthetic day)" value={byShift.reduce((a, s) => a + s.completed, 0)} sub={`${byShift.reduce((a, s) => a + s.open, 0)} open across shifts`} />
        <StatTile className="col-span-6 md:col-span-3" label="Certifications due soon" value={CERTIFICATIONS.reduce((a, c) => a + c.dueSoon, 0)} sub={`${CERTIFICATIONS.reduce((a, c) => a + c.expired, 0)} expired (fictional)`} tone="amber" />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Alert acknowledgment by type (this session)" className="col-span-12 xl:col-span-6" bodyClassName="p-2 h-[240px]">
          {byType.length === 0 ? (
            <div className="p-4 text-[11.5px] text-graphite-400">No alerts this session yet. Run scenarios to populate acknowledgment patterns.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byType} layout="vertical">
                <CartesianGrid stroke="#212a37" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="type" tickLine={false} axisLine={false} width={190} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend />
                <Bar isAnimationActive={false} dataKey="count" name="Alerts" fill={C.teal} radius={[0, 3, 3, 0]} />
                <Bar isAnimationActive={false} dataKey="ack" name="Avg time to action (s)" fill={C.amber} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Review completion patterns by shift (synthetic day)" className="col-span-12 xl:col-span-6" bodyClassName="p-2 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byShift}>
              <CartesianGrid stroke="#212a37" vertical={false} />
              <XAxis dataKey="shift" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={30} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend />
              <Bar isAnimationActive={false} dataKey="completed" name="Reviews completed" fill={C.teal} radius={[3, 3, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="open" name="Open at shift end" fill={C.amber} radius={[3, 3, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="medianAck" name="Median ack (s)" fill={C.violet} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Shift-level bottlenecks (synthetic)" className="col-span-12 xl:col-span-7" bodyClassName="p-0 overflow-auto max-h-[320px]">
          <table className="tbl">
            <thead>
              <tr>
                <th>Attraction</th>
                <th>Shift</th>
                <th>Reviews</th>
                <th>Median ack</th>
                <th>p90 ack</th>
                <th>Avg dwell</th>
                <th>Slow gates</th>
                <th>Observed bottleneck</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s, i) => (
                <tr key={i}>
                  <td>{getRide(s.rideId).name}</td>
                  <td className="text-graphite-300">{s.shift}</td>
                  <td className="mono">{s.reviewsCompleted} / {s.reviewsOpen} open</td>
                  <td className="mono">{s.medianAckSec}s</td>
                  <td className="mono">{s.p90AckSec}s</td>
                  <td className="mono">{num(s.avgDwellSec)}s</td>
                  <td className="mono">{s.slowGateEvents}</td>
                  <td><Badge tone={s.bottleneck === 'None observed' ? 'green' : 'amber'}>{s.bottleneck}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="col-span-12 xl:col-span-5 flex flex-col gap-3">
          <AgentCard n={4} name="Staffing & Training" purpose="Turns aggregate review and dispatch patterns into coaching priorities. Oriented toward training, not surveillance.">
            <ol className="mt-2 flex flex-col gap-1.5">
              {COACHING_TOPICS.map((t) => (
                <li key={t.topic} className="text-[11.5px]">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium">{t.topic}</span>
                    <span className="w-20 h-1.5 bg-graphite-700 rounded overflow-hidden inline-block">
                      <span className="block h-full bg-signal-teal" style={{ width: `${t.relevance * 100}%` }} />
                    </span>
                    <span className="mono text-graphite-300 w-8 text-right">{Math.round(t.relevance * 100)}</span>
                  </div>
                  <div className="text-[10.5px] text-graphite-400">{t.rationale}</div>
                </li>
              ))}
            </ol>
          </AgentCard>
          <Panel title="Certification status (fictional demonstration data)" bodyClassName="p-0">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Certified</th>
                  <th>Due soon</th>
                  <th>Expired</th>
                </tr>
              </thead>
              <tbody>
                {CERTIFICATIONS.map((c) => (
                  <tr key={c.role}>
                    <td>{c.role}</td>
                    <td className="mono">{c.certified}</td>
                    <td className="mono">{c.dueSoon ? <Badge tone="amber">{c.dueSoon}</Badge> : 0}</td>
                    <td className="mono">{c.expired ? <Badge tone="red">{c.expired}</Badge> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
