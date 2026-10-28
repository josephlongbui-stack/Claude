import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DEFAULT_ROI, computeRoi, type RoiInputs } from '@/domain/analytics/roi';
import { Field, Notice, Panel, SectionTitle, StatTile, money, num } from '@/components/ui';

const C = { teal: '#22d3ee', amber: '#f59e0b', violet: '#a78bfa', slate: '#8794a5', green: '#4ade80', red: '#ef4444' };

const FIELDS: { key: keyof RoiInputs; label: string; step: number; min: number; hint?: string; format?: 'money' | 'pct' }[] = [
  { key: 'annualSubscription', label: 'Annual software subscription', step: 5000, min: 0, format: 'money', hint: 'Illustrative pricing scenario — editable, not a contract.' },
  { key: 'installationCost', label: 'Installation cost (one-time)', step: 5000, min: 0, format: 'money' },
  { key: 'attractions', label: 'Number of attractions', step: 1, min: 1 },
  { key: 'operatingDays', label: 'Operating days / year', step: 5, min: 1 },
  { key: 'operatingHours', label: 'Operating hours / day', step: 0.5, min: 1 },
  { key: 'baselineDwellSec', label: 'Baseline station dwell (s)', step: 5, min: 20 },
  { key: 'secondsSavedPerCycle', label: 'Estimated time saved per station cycle (s)', step: 1, min: 0 },
  { key: 'trainCapacity', label: 'Seats per dispatch', step: 1, min: 1 },
  { key: 'loadFactor', label: 'Assumed average load factor', step: 0.01, min: 0.1, format: 'pct' },
  { key: 'demandCaptureRate', label: 'Share of recovered capacity actually used', step: 0.05, min: 0, format: 'pct', hint: 'Recovered capacity only has value when demand exists.' },
  { key: 'valuePerRecoveredRider', label: 'Assumed value per recovered rider ($)', step: 0.1, min: 0 },
  { key: 'laborCostPerHour', label: 'Assumed labor cost ($ / hour)', step: 1, min: 0 },
  { key: 'staffHoursSavedPerDay', label: 'Staff hours saved / day / attraction', step: 0.25, min: 0, hint: 'Reporting and paperwork time only — no labor replacement is claimed.' },
];

export default function BusinessImpact() {
  const [inputs, setInputs] = useState<RoiInputs>(DEFAULT_ROI);
  const r = useMemo(() => computeRoi(inputs), [inputs]);
  const set = (k: keyof RoiInputs, v: number): void => setInputs((s) => ({ ...s, [k]: v }));
  const cash = [
    { name: 'Year 1', cost: -r.firstYearCost, value: r.annualValue, net: r.annualValue - r.firstYearCost },
    { name: 'Year 2', cost: -r.annualSoftwareCost, value: r.annualValue, net: r.annualValue - r.annualSoftwareCost },
    { name: 'Year 3', cost: -r.annualSoftwareCost, value: r.annualValue, net: r.annualValue - r.annualSoftwareCost },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Interactive financial analysis. Every output is computed from the inputs on this page; nothing is drawn from customer deployments, insurers or injury statistics.">Business Impact · ROI scenario</SectionTitle>
      <Notice tone="warn">Illustrative only. The $150,000 subscription is an editable pricing scenario, not a verified contract or customer commitment. No insurer savings, guaranteed injury reductions, proven labor replacement or deployment statistics are represented.</Notice>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Inputs" className="col-span-12 xl:col-span-4" bodyClassName="p-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <input
                type="number"
                className="input"
                step={f.step}
                min={f.min}
                value={f.format === 'pct' ? Math.round(inputs[f.key] * 100) : inputs[f.key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  set(f.key, f.format === 'pct' ? v / 100 : v);
                }}
                aria-label={f.label}
              />
            </Field>
          ))}
          <button className="btn col-span-2" onClick={() => setInputs(DEFAULT_ROI)}>Reset to illustrative defaults</button>
        </Panel>
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-3">
          <div className="grid grid-cols-12 gap-2">
            <StatTile className="col-span-6 md:col-span-4" label="Estimated annual software cost" value={money(r.annualSoftwareCost)} sub={`first year incl. install ${money(r.firstYearCost)}`} />
            <StatTile className="col-span-6 md:col-span-4" label="Estimated operating savings" value={money(r.laborSavings)} sub="reporting / paperwork time" />
            <StatTile className="col-span-6 md:col-span-4" label="Potential recovered capacity" value={`${num(r.recoveredRidersPerYear)} riders / yr`} sub={`${num(r.recoveredRidersPerDay)} / day / attraction`} tone="teal" />
            <StatTile className="col-span-6 md:col-span-4" label="Illustrative annual economic value" value={money(r.annualValue)} sub="capacity value + operating savings" tone="green" />
            <StatTile className="col-span-6 md:col-span-4" label="Net first year" value={money(r.netFirstYear)} tone={r.netFirstYear >= 0 ? 'green' : 'red'} />
            <StatTile className="col-span-6 md:col-span-4" label="Payback period" value={r.paybackMonths === null ? 'n/a' : `${num(r.paybackMonths, 1)} months`} sub="under the stated assumptions" tone={r.paybackMonths !== null && r.paybackMonths <= 12 ? 'green' : 'amber'} />
          </div>
          <div className="grid grid-cols-12 gap-3">
            <Panel title="Three-year illustration" className="col-span-12 lg:col-span-5" bodyClassName="p-2 h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cash}>
                  <CartesianGrid stroke="#212a37" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend />
                  <Bar isAnimationActive={false} dataKey="value" name="Illustrative value" fill={C.teal} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="cost" name="Cost" fill={C.red} radius={[3, 3, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="net" name="Net" fill={C.green} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="How the numbers are derived" className="col-span-12 lg:col-span-7" bodyClassName="p-0">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Formula</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {r.steps.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td className="mono text-[10.5px] text-graphite-300">{s.formula}</td>
                      <td className="mono text-right">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
