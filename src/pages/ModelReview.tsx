import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { CONDITION_LABELS, LABEL_OPTIONS, TRAINING_SAMPLES, evaluate, type TrainingLabel, type TrainingSample } from '@/data/training';
import { useTrainingStore } from '@/store/training';
import { useSettingsStore } from '@/store/settings';
import { useRecordsStore } from '@/store/records';
import { useSimulationStore } from '@/store/simulation';
import { SampleFrame } from '@/features/config/SampleFrame';
import { Badge, Notice, Panel, SectionTitle, StatTile, pct } from '@/components/ui';
import { downloadText } from '@/domain/evidence/export';
import { getRide } from '@/domain/rides/configs';

const C = { teal: '#22d3ee', amber: '#f59e0b', violet: '#a78bfa', green: '#4ade80', red: '#ef4444' };

function labelTone(l: TrainingLabel): 'teal' | 'amber' | 'red' | 'green' | 'slate' | 'violet' {
  return l === 'concern' ? 'red' : l === 'review' ? 'amber' : l === 'unknown' ? 'violet' : l === 'false_alarm' ? 'slate' : 'green';
}

export default function ModelReview() {
  const corrections = useTrainingStore((s) => s.corrections);
  const setCorrection = useTrainingStore((s) => s.setCorrection);
  const clearCorrection = useTrainingStore((s) => s.clearCorrection);
  const reviewer = useSettingsStore((s) => s.reviewerName);
  const [condition, setCondition] = useState<TrainingSample['condition'] | 'all'>('all');
  const [selectedId, setSelectedId] = useState(TRAINING_SAMPLES[0].id);
  const [label, setLabel] = useState<TrainingLabel>('nominal');
  const [note, setNote] = useState('');
  const samples = useMemo(() => TRAINING_SAMPLES.filter((s) => condition === 'all' || s.condition === condition), [condition]);
  const selected = TRAINING_SAMPLES.find((s) => s.id === selectedId) ?? TRAINING_SAMPLES[0];
  const metrics = useMemo(() => evaluate(TRAINING_SAMPLES, corrections), [corrections]);
  const byCondition = useMemo(() => (Object.keys(CONDITION_LABELS) as TrainingSample['condition'][]).map((c) => {
    const subset = TRAINING_SAMPLES.filter((s) => s.condition === c);
    const agree = subset.filter((s) => (corrections[s.id]?.label ?? s.reviewerLabel) === s.modelLabel).length;
    return { name: CONDITION_LABELS[c], agreement: Math.round((agree / Math.max(1, subset.length)) * 100), samples: subset.length };
  }), [corrections]);

  const save = (): void => {
    setCorrection(selected.id, label, note.trim(), reviewer);
    useRecordsStore.getState().logEvent({ type: 'training_label', title: `Reviewer label recorded — ${selected.id}`, detail: `Reviewer labelled ${selected.id} as "${label}" (model: ${selected.modelLabel}). ${note.trim() ? `Note: ${note.trim()}` : ''} Stored locally for future evaluation.`, severity: 'info', rideId: selected.rideId, scenarioId: 'none', atMs: useSimulationStore.getState().sessionMs, cameraId: selected.cameraId });
    setNote('');
  };

  const exportLabels = (): void => {
    void downloadText(`rideops-label-corrections-${Date.now()}.json`, JSON.stringify({ disclaimer: 'Synthetic review labels — demonstration only', corrections }, null, 2), 'application/json');
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="How reviewed events could support future model evaluation. All frames and labels are synthetic; metrics here do not establish real-world model performance.">Model Review Data</SectionTitle>
      <div className="grid grid-cols-12 gap-2">
        <StatTile className="col-span-6 md:col-span-3" label="Precision (synthetic)" value={pct(metrics.precision)} sub={`${metrics.tp} TP · ${metrics.fp} FP`} tone="teal" />
        <StatTile className="col-span-6 md:col-span-3" label="Recall (synthetic)" value={pct(metrics.recall)} sub={`${metrics.fn} FN`} tone="teal" />
        <StatTile className="col-span-6 md:col-span-3" label="False-positive rate (synthetic)" value={pct(metrics.falsePositiveRate)} sub={`${metrics.fp} FP · ${metrics.tn} TN`} />
        <StatTile className="col-span-6 md:col-span-3" label="Reviewer corrections stored" value={Object.keys(corrections).length} sub="browser local storage" />
      </div>
      <Notice tone="warn">Evaluation treats “review” and “concern” as a raised flag and compares the model label to the reviewer label. With {metrics.n} synthetic samples this is a workflow demonstration, not a validation study.</Notice>
      <div className="grid grid-cols-12 gap-3">
        <Panel
          title={`Staged samples · ${samples.length}`}
          className="col-span-12 xl:col-span-8"
          bodyClassName="p-3"
          actions={
            <select className="select !w-auto !py-0.5 !text-[11px]" value={condition} onChange={(e) => setCondition(e.target.value as TrainingSample['condition'] | 'all')} aria-label="Condition filter">
              <option value="all">All conditions</option>
              {(Object.keys(CONDITION_LABELS) as TrainingSample['condition'][]).map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
              ))}
            </select>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {samples.map((s) => {
              const corr = corrections[s.id];
              return (
                <button key={s.id} className={`text-left rounded border p-1.5 ${selectedId === s.id ? 'border-signal-teal' : 'border-graphite-700'} bg-graphite-800 hover:border-graphite-500`} onClick={() => { setSelectedId(s.id); setLabel(corrections[s.id]?.label ?? s.reviewerLabel); }}>
                  <SampleFrame sample={s} />
                  <div className="mt-1 text-[11px] font-medium leading-tight">{s.conditionLabel}</div>
                  <div className="text-[10px] text-graphite-400">{getRide(s.rideId).name} · {s.seatId}</div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <Badge tone={labelTone(s.modelLabel)}>model: {s.modelLabel}</Badge>
                    <Badge tone={labelTone(corr?.label ?? s.reviewerLabel)}>{corr ? 'corrected' : 'reviewer'}: {corr?.label ?? s.reviewerLabel}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
        <div className="col-span-12 xl:col-span-4 flex flex-col gap-3">
          <Panel title={`Label sample · ${selected.id}`} bodyClassName="p-3 flex flex-col gap-2">
            <SampleFrame sample={selected} />
            <div className="text-[11.5px]">{selected.description}</div>
            <div className="text-[11px] text-graphite-300">Condition: {CONDITION_LABELS[selected.condition]} · model said <Badge tone={labelTone(selected.modelLabel)}>{selected.modelLabel}</Badge> at {Math.round(selected.modelConfidence * 100)}%</div>
            <label className="text-[11.5px] flex flex-col gap-1">
              <span className="text-graphite-300 font-medium">Reviewer label</span>
              <select className="select" value={label} onChange={(e) => setLabel(e.target.value as TrainingLabel)}>
                {LABEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <textarea className="textarea" placeholder="Reviewer note…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reviewer note" />
            <div className="flex gap-1.5">
              <button className="btn btn-primary" onClick={save}>Save label correction</button>
              {corrections[selected.id] && (
                <button className="btn btn-ghost" onClick={() => clearCorrection(selected.id)}>Clear</button>
              )}
            </div>
            {corrections[selected.id] && (
              <div className="text-[10.5px] text-graphite-400">
                Stored locally: {corrections[selected.id].label} by {corrections[selected.id].reviewer} at {new Date(corrections[selected.id].at).toLocaleString()}
                {corrections[selected.id].note ? ` — “${corrections[selected.id].note}”` : ''}
              </div>
            )}
          </Panel>
          <Panel title="Model–reviewer agreement by condition (synthetic)" bodyClassName="p-2 h-[220px]" actions={<button className="btn btn-xs" onClick={exportLabels}><Download size={12} /> Export labels</button>}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCondition} layout="vertical">
                <CartesianGrid stroke="#212a37" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} unit="%" />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={140} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend />
                <Bar isAnimationActive={false} dataKey="agreement" name="Agreement %" fill={C.teal} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>
    </div>
  );
}
