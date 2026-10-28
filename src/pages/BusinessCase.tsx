import { useMemo, useState } from 'react';
import { DEFAULT_ROI, computeRoi, type RoiInputs } from '@/domain/analytics/roi';
import { Field, Notice, Panel, SectionTitle, StatTile, money, num } from '@/components/ui';

const FIELDS: { key: keyof RoiInputs; label: string; step: number; percent?: boolean }[] = [
  { key: 'annualSubscription', label: 'Subscription per year ($)', step: 5000 },
  { key: 'installationCost', label: 'Installation, one-time ($)', step: 5000 },
  { key: 'attractions', label: 'Rides covered', step: 1 },
  { key: 'operatingDays', label: 'Operating days per year', step: 5 },
  { key: 'operatingHours', label: 'Hours open per day', step: 0.5 },
  { key: 'baselineDwellSec', label: 'Time in station today (s)', step: 5 },
  { key: 'secondsSavedPerCycle', label: 'Seconds saved per dispatch', step: 1 },
  { key: 'seatsPerDispatch', label: 'Seats per train', step: 1 },
  { key: 'loadFactor', label: 'Seats filled (%)', step: 1, percent: true },
  { key: 'demandCaptureRate', label: 'Extra capacity actually used (%)', step: 5, percent: true },
  { key: 'valuePerRecoveredRider', label: 'Value per extra rider ($)', step: 0.1 },
];

export default function BusinessCase() {
  const [inputs, setInputs] = useState<RoiInputs>(DEFAULT_ROI);
  const r = useMemo(() => computeRoi(inputs), [inputs]);

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Every number below is worked out from the inputs on this page. Change any of them.">Business Case</SectionTitle>
      <Notice tone="warn">Illustration only. The $150,000 subscription is an example price, not a quote. No insurance savings, injury reductions, staff cuts or customer results are claimed.</Notice>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label="Cost per year" value={money(r.annualCost)} sub={`first year ${money(r.firstYearCost)}`} />
        <StatTile label="Extra riders per year" value={num(r.recoveredRidersPerYear)} tone="teal" />
        <StatTile label="Value per year" value={money(r.annualValue)} tone="green" />
        <StatTile label="Payback" value={r.paybackMonths === null ? 'n/a' : `${num(r.paybackMonths, 1)} months`} tone={r.paybackMonths !== null && r.paybackMonths <= 24 ? 'green' : 'amber'} />
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Assumptions" className="col-span-12 lg:col-span-5" bodyClassName="p-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <input
                type="number"
                className="input"
                step={f.step}
                min={0}
                value={f.percent ? Math.round(inputs[f.key] * 100) : inputs[f.key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setInputs((s) => ({ ...s, [f.key]: f.percent ? v / 100 : v }));
                }}
                aria-label={f.label}
              />
            </Field>
          ))}
          <button className="btn col-span-2" onClick={() => setInputs(DEFAULT_ROI)}>
            Reset to example values
          </button>
        </Panel>
        <Panel title="How it's worked out" className="col-span-12 lg:col-span-7" bodyClassName="p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Step</th>
                <th>Formula</th>
                <th className="text-right">Value</th>
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
  );
}
