import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { Badge, Notice, Panel, SectionTitle } from '@/components/ui';

interface Stage {
  id: string;
  n: number;
  title: string;
  status: 'complete' | 'in_progress' | 'planned';
  summary: string;
  checklist: string[];
  milestone: string;
}

const STAGES: Stage[] = [
  { id: 'survey', n: 1, title: 'Site survey', status: 'complete', summary: 'Walk the station with operations and maintenance; document camera mounting points, lighting, power and network.', checklist: ['Station geometry and seat map captured', 'Mounting points and sightlines photographed', 'Power and network paths confirmed', 'Privacy zones identified (no guest-facing queue cameras)'], milestone: 'Survey report accepted (fictional milestone)' },
  { id: 'install', n: 2, title: 'Camera placement and calibration', status: 'complete', summary: 'Install 2–4 fixed station cameras and the on-site edge node; draw per-seat observation regions and save calibration presets.', checklist: ['Cameras mounted and focused', 'Edge node commissioned (offline, no controller link)', 'Per-seat regions calibrated per camera', 'Lighting modes verified (day / evening / IR)'], milestone: 'Calibration presets signed off' },
  { id: 'shadow', n: 3, title: 'Shadow-mode observation', status: 'in_progress', summary: 'The system records observations and would-be alerts without any operator-facing display. Nothing affects ride operation.', checklist: ['Shadow mode enabled for 4+ weeks', 'Daily record export reviewed by the park', 'False-flag rate and unknown rate tracked per camera', 'No operational dependency confirmed by ops lead'], milestone: 'Shadow-mode evidence pack delivered' },
  { id: 'assisted', n: 4, title: 'Human-reviewed assisted demonstration', status: 'planned', summary: 'Operators see informational flags alongside their existing, unchanged physical check procedure. Every flag is closed by a human.', checklist: ['Operator briefing: flags are informational only', 'SOP unchanged; physical checks remain mandatory', 'Review workflow and notes used on every flag', 'Supervisor sign-off each shift'], milestone: 'Assisted demonstration review meeting' },
  { id: 'validation', n: 5, title: 'Review of validation evidence', status: 'planned', summary: 'Jointly review precision/recall on reviewed events, unknown rates, latency and operator feedback. Decide whether a separately engineered, validated system is warranted.', checklist: ['Reviewed-event dataset compiled', 'Metrics reviewed with engineering and safety leads', 'Open risks and limitations documented', 'Go / no-go for a validated system programme'], milestone: 'Validation evidence review' },
  { id: 'reporting', n: 6, title: 'Operational reporting', status: 'planned', summary: 'Dispatch, throughput, maintenance and training analytics delivered as recurring operational reports.', checklist: ['Weekly dispatch and throughput report', 'Maintenance trend digest', 'Training topic summary', 'Evidence export procedure documented'], milestone: 'First monthly operations report' },
];

const METRICS = [
  { metric: 'Unknown-state rate per camera', target: '< 5% of occupied seat-frames', how: 'Evaluator output over shadow-mode period' },
  { metric: 'Reviewer agreement with flags', target: '> 85% on reviewed events', how: 'Model Review Data labels vs model labels' },
  { metric: 'Median time to first human action', target: '< 30 s simulated / < 60 s pilot', how: 'Event log timestamps (alert_raised → first action)' },
  { metric: 'Observation latency', target: '< 150 ms frame-to-state', how: 'Edge node telemetry (fictional in demo)' },
  { metric: 'Dispatch interval change', target: 'Reported, not targeted', how: 'Dispatch Analytics before/after, scenario-labelled' },
  { metric: 'Zero operational dependency', target: 'Mandatory', how: 'Ops lead attestation; no interlock or control path exists' },
];

interface PilotState {
  done: Record<string, boolean>;
  toggle: (k: string) => void;
}

const usePilotStore = create<PilotState>()(
  persist(
    (set) => ({
      done: {},
      toggle: (k) => set((s) => ({ done: { ...s.done, [k]: !s.done[k] } })),
    }),
    { name: 'rideops.pilot.v1', storage: createJSONStorage(() => localStorage) },
  ),
);

export default function Pilot() {
  const done = usePilotStore((s) => s.done);
  const toggle = usePilotStore((s) => s.toggle);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="Proposed rollout for a prospective pilot. Shadow mode produces records without affecting ride operation. There is no real-world dispatch interlock feature in this MVP.">Pilot & Deployment</SectionTitle>
      <div className="grid grid-cols-12 gap-3">
        <Panel title="Rollout stages" className="col-span-12 xl:col-span-8" bodyClassName="p-3 flex flex-col gap-2">
          <ol className="grid grid-cols-6 gap-1 mb-2">
            {STAGES.map((s) => (
              <li key={s.id} className="flex flex-col items-center text-center gap-1">
                {s.status === 'complete' ? <CheckCircle2 size={18} className="text-signal-green" /> : s.status === 'in_progress' ? <CircleDot size={18} className="text-signal-teal" /> : <Circle size={18} className="text-graphite-500" />}
                <span className="text-[10.5px] leading-tight">{s.n}. {s.title}</span>
              </li>
            ))}
          </ol>
          {STAGES.map((s) => {
            const completed = s.checklist.filter((_, i) => done[`${s.id}:${i}`] || s.status === 'complete').length;
            return (
              <div key={s.id} className="rounded border border-graphite-700 bg-graphite-800 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] font-semibold">{s.n}. {s.title}</span>
                  <Badge tone={s.status === 'complete' ? 'green' : s.status === 'in_progress' ? 'teal' : 'slate'}>{s.status.replace('_', ' ')}</Badge>
                  <span className="text-[10.5px] text-graphite-400 ml-auto">{completed}/{s.checklist.length} checklist items</span>
                </div>
                <div className="text-[11.5px] text-graphite-300 mt-1">{s.summary}</div>
                <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                  {s.checklist.map((c, i) => {
                    const k = `${s.id}:${i}`;
                    const checked = s.status === 'complete' || Boolean(done[k]);
                    return (
                      <li key={k}>
                        <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                          <input type="checkbox" checked={checked} disabled={s.status === 'complete'} onChange={() => toggle(k)} />
                          <span className={checked ? 'text-graphite-300 line-through' : ''}>{c}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="text-[10.5px] text-graphite-400 mt-2">Milestone: {s.milestone}</div>
              </div>
            );
          })}
        </Panel>
        <div className="col-span-12 xl:col-span-4 flex flex-col gap-3">
          <Panel title="Evaluation metrics" bodyClassName="p-0">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Target</th>
                  <th>How measured</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => (
                  <tr key={m.metric}>
                    <td className="font-medium">{m.metric}</td>
                    <td className="text-graphite-200">{m.target}</td>
                    <td className="text-graphite-300 text-[10.5px]">{m.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Future integration — separately validated vision service" bodyClassName="p-3">
            <svg viewBox="0 0 320 200" className="w-full" role="img" aria-label="Future integration diagram">
              <defs>
                <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#22d3ee" />
                </marker>
              </defs>
              <rect x="10" y="20" width="90" height="40" rx="4" fill="#141a24" stroke="#3d4959" />
              <text x="55" y="37" textAnchor="middle" fontSize="8.5" fill="#dde3ea">Station cameras</text>
              <text x="55" y="50" textAnchor="middle" fontSize="7.5" fill="#8794a5">fixed, on-site</text>
              <rect x="115" y="20" width="95" height="40" rx="4" fill="#0e2a30" stroke="#22d3ee" />
              <text x="162" y="34" textAnchor="middle" fontSize="8.5" fill="#67e8f9">Validated CV service</text>
              <text x="162" y="46" textAnchor="middle" fontSize="7.5" fill="#8794a5">separately engineered</text>
              <text x="162" y="56" textAnchor="middle" fontSize="7.5" fill="#8794a5">&amp; validated · future</text>
              <rect x="225" y="20" width="85" height="40" rx="4" fill="#141a24" stroke="#3d4959" />
              <text x="267" y="37" textAnchor="middle" fontSize="8.5" fill="#dde3ea">Observation API</text>
              <text x="267" y="50" textAnchor="middle" fontSize="7.5" fill="#8794a5">SeatObservationSample</text>
              <line x1="100" y1="40" x2="113" y2="40" stroke="#22d3ee" markerEnd="url(#arr)" />
              <line x1="210" y1="40" x2="223" y2="40" stroke="#22d3ee" markerEnd="url(#arr)" />
              <rect x="60" y="100" width="200" height="40" rx="4" fill="#141a24" stroke="#3d4959" />
              <text x="160" y="116" textAnchor="middle" fontSize="8.5" fill="#dde3ea">RideOps evaluator · review queue · event log · analytics</text>
              <text x="160" y="130" textAnchor="middle" fontSize="7.5" fill="#8794a5">this MVP — unchanged; the simulated provider is replaced</text>
              <line x1="267" y1="60" x2="200" y2="98" stroke="#22d3ee" markerEnd="url(#arr)" />
              <rect x="60" y="160" width="200" height="28" rx="4" fill="#1a1010" stroke="#7f1d1d" strokeDasharray="4 3" />
              <text x="160" y="172" textAnchor="middle" fontSize="8" fill="#fca5a5">Ride control / interlocks — NOT connected</text>
              <text x="160" y="182" textAnchor="middle" fontSize="7" fill="#8794a5">out of scope; would require a separate certified system</text>
            </svg>
          </Panel>
          <Notice>Shadow mode in this demo produces records and would-be alerts without any operator-facing readiness display. Switch modes from the top bar to see the difference in the Live Ride Monitor.</Notice>
        </div>
      </div>
    </div>
  );
}
