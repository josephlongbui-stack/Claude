import { useEffect, useMemo, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { useSimulationStore } from '@/store/simulation';
import { useSettingsStore, ALL_ALERT_TYPES, type CalibrationRegion, type LightingMode } from '@/store/settings';
import { useRecordsStore } from '@/store/records';
import { getRide } from '@/domain/rides/configs';
import { seatLabel } from '@/domain/rides/seats';
import { ALERT_TYPE_LABEL } from '@/domain/review/workflow';
import { CalibrationCanvas, defaultRegions } from '@/features/config/CalibrationCanvas';
import { Badge, Field, Notice, Panel, SectionTitle, Slider, Toggle } from '@/components/ui';

function PlacementDiagram({ rideId, selected, onSelect }: { rideId: string; selected: string; onSelect: (id: string) => void }) {
  const ride = getRide(rideId);
  const isSlide = ride.geometry.kind === 'slide';
  return (
    <svg viewBox="0 0 300 200" className="w-full" role="img" aria-label="Camera placement diagram">
      <rect x="10" y="10" width="280" height="180" rx="6" fill="#0f141c" stroke="#2c3645" />
      {/* platform */}
      <rect x="40" y="60" width="220" height="80" rx="4" fill="#1a212d" stroke="#3d4959" />
      <text x="150" y="104" textAnchor="middle" fontSize="9" fill="#8794a5">{isSlide ? 'SLIDE TOWER · PLATFORM · RUN-OUT' : `STATION PLATFORM · ${ride.geometry.rows * ride.geometry.seatsPerRow} seats`}</text>
      {!isSlide && (
        <>
          <line x1="40" y1="150" x2="260" y2="150" stroke="#55637a" strokeWidth="2" />
          <line x1="40" y1="156" x2="260" y2="156" stroke="#55637a" strokeWidth="1" />
          <text x="150" y="168" textAnchor="middle" fontSize="8" fill="#5b6878">TRACK</text>
        </>
      )}
      {/* edge computer */}
      <rect x="236" y="20" width="48" height="26" rx="3" fill="#141a24" stroke="#22d3ee" />
      <text x="260" y="31" textAnchor="middle" fontSize="7.5" fill="#67e8f9">EDGE NODE</text>
      <text x="260" y="41" textAnchor="middle" fontSize="7" fill="#8794a5">on-site · sim</text>
      {ride.cameras.map((c) => {
        const x = 10 + (c.placement.x / 100) * 280;
        const y = 10 + (c.placement.y / 100) * 180;
        const a = (c.placement.angle * Math.PI) / 180;
        const fov = (c.placement.fov * Math.PI) / 180;
        const r = 70;
        const p1 = [x + Math.sin(a - fov / 2) * r, y - Math.cos(a - fov / 2) * r];
        const p2 = [x + Math.sin(a + fov / 2) * r, y - Math.cos(a + fov / 2) * r];
        const sel = c.id === selected;
        return (
          <g key={c.id} onClick={() => onSelect(c.id)} style={{ cursor: 'pointer' }}>
            <path d={`M ${x} ${y} L ${p1[0]} ${p1[1]} A ${r} ${r} 0 0 1 ${p2[0]} ${p2[1]} Z`} fill={sel ? 'rgba(34,211,238,0.18)' : 'rgba(34,211,238,0.06)'} stroke={sel ? '#22d3ee' : 'rgba(34,211,238,0.3)'} strokeDasharray="3 2" />
            <line x1={x} y1={y} x2={262} y2={46} stroke="#22d3ee" strokeOpacity="0.25" strokeDasharray="2 3" />
            <circle cx={x} cy={y} r={6} fill={sel ? '#22d3ee' : '#1a212d'} stroke="#22d3ee" />
            <text x={x} y={y - 9} textAnchor="middle" fontSize="8" fill={sel ? '#67e8f9' : '#b4bfcc'}>{c.id}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function RideConfiguration() {
  const rideId = useSimulationStore((s) => s.rideId);
  const cameras = useSimulationStore((s) => s.cameras);
  const frameCount = useSimulationStore((s) => s.frameCount);
  const simMs = useSimulationStore((s) => s.simMs);
  const events = useRecordsStore((s) => s.events.length);
  const settings = useSettingsStore();
  const ride = getRide(rideId);
  const [camId, setCamId] = useState(ride.cameras[0].id);
  const cam = ride.cameras.find((c) => c.id === camId) ?? ride.cameras[0];
  const [selectedSeat, setSelectedSeat] = useState<string | null>(cam.coverage[0] ?? null);
  const [presetName, setPresetName] = useState('');
  const activePresetId = settings.activePresetByRide[rideId];
  const activePreset = settings.presets.find((p) => p.id === activePresetId && p.cameraId === cam.id);
  const [regions, setRegions] = useState<Record<string, CalibrationRegion>>(() => defaultRegions(ride, cam));

  useEffect(() => {
    const c = ride.cameras.find((x) => x.id === camId) ?? ride.cameras[0];
    setCamId(c.id);
    setSelectedSeat(c.coverage[0] ?? null);
    setRegions(activePreset && activePreset.cameraId === c.id ? activePreset.regions : defaultRegions(ride, c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, camId, activePresetId]);

  const storageBytes = useMemo(() => {
    try {
      let n = 0;
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k?.startsWith('rideops.')) n += (localStorage.getItem(k)?.length ?? 0) * 2;
      }
      return n;
    } catch {
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, settings.presets.length]);

  const savePreset = (): void => {
    const name = presetName.trim() || `${ride.name} · ${cam.id} · ${new Date().toLocaleTimeString()}`;
    settings.savePreset({ name, rideId, cameraId: cam.id, regions });
    setPresetName('');
  };

  const edgeLoad = 34 + Math.round(8 * Math.sin(simMs / 3000));

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub={`${ride.name} · camera calibration, evaluator settings, alert configuration and simulated system health. All adapters are fictional and read-only.`}>Ride Configuration</SectionTitle>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-3 flex flex-col gap-3">
          <Panel title="Camera selection & placement" bodyClassName="p-3 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {ride.cameras.map((c) => (
                <button key={c.id} className={`btn btn-xs ${c.id === camId ? 'btn-primary' : ''}`} onClick={() => setCamId(c.id)}>
                  {c.id}
                </button>
              ))}
            </div>
            <PlacementDiagram rideId={rideId} selected={camId} onSelect={setCamId} />
            <div className="text-[11px] text-graphite-300">
              <div><span className="text-graphite-400">Label:</span> {cam.label}</div>
              <div><span className="text-graphite-400">View:</span> {cam.view} · <span className="text-graphite-400">mode:</span> {cam.mode}</div>
              <div><span className="text-graphite-400">FOV:</span> {cam.placement.fov}° · bearing {cam.placement.angle}°</div>
              <div><span className="text-graphite-400">Coverage:</span> {cam.coverage.length ? `${cam.coverage.length} seats` : 'gates / zone only'}</div>
            </div>
          </Panel>
          <Panel title="Lighting & evaluator" bodyClassName="p-3 flex flex-col gap-3">
            <Field label="Lighting mode">
              <select className="select" value={settings.lighting} onChange={(e) => settings.setLighting(e.target.value as LightingMode)}>
                <option value="daylight">Daylight</option>
                <option value="evening">Evening / low light</option>
                <option value="infrared">Simulated infrared</option>
              </select>
            </Field>
            <Toggle label="Simulated infrared mode" checked={settings.lighting === 'infrared'} onChange={(v) => settings.setLighting(v ? 'infrared' : 'daylight')} />
            <Toggle label="Privacy: render silhouettes only" checked={settings.privacySilhouettes} onChange={settings.setPrivacySilhouettes} hint="No faces or identities are ever rendered or stored." />
            <Slider label="Confidence threshold" value={settings.evaluator.confidenceThreshold} min={0.4} max={0.95} step={0.01} onChange={(v) => settings.setEvaluator({ confidenceThreshold: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Stabilisation frames" value={settings.evaluator.stabilizationFrames} min={1} max={10} step={1} onChange={(v) => settings.setEvaluator({ stabilizationFrames: v })} />
            <Field label="Low-confidence handling">
              <select className="select" value={settings.lowConfidenceHandling} onChange={(e) => settings.setLowConfidenceHandling(e.target.value as 'unknown_review' | 'unknown_hold')}>
                <option value="unknown_review">Report Unknown → open review item</option>
                <option value="unknown_hold">Report Unknown → hold until stabilised, then review</option>
              </select>
            </Field>
            <Slider label="Local data retention" value={settings.retentionDays} min={1} max={365} step={1} onChange={settings.setRetentionDays} format={(v) => `${v} days`} />
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-6 flex flex-col gap-3">
          <Panel
            title="Calibration · per-seat observation regions"
            actions={
              <span className="text-[11px] text-graphite-300">
                {activePreset ? <Badge tone="teal">preset: {activePreset.name}</Badge> : <Badge tone="slate">default regions</Badge>}
              </span>
            }
            bodyClassName="p-3 flex flex-col gap-2"
          >
            <CalibrationCanvas ride={ride} cam={cam} regions={regions} selectedSeat={selectedSeat} onRegion={(id, r) => setRegions((s) => ({ ...s, [id]: r }))} infrared={settings.lighting === 'infrared'} />
            {cam.coverage.length === 0 ? (
              <Notice>This camera observes gates or a zone rather than seats. Select a seat-covering camera to draw per-seat regions.</Notice>
            ) : (
              <div className="flex flex-wrap gap-1">
                {cam.coverage.map((id) => (
                  <button key={id} className={`btn btn-xs ${selectedSeat === id ? 'btn-primary' : ''}`} onClick={() => setSelectedSeat(id)}>
                    {id}
                  </button>
                ))}
                <button className="btn btn-xs btn-ghost ml-auto" onClick={() => setRegions(defaultRegions(ride, cam))}>Reset regions</button>
              </div>
            )}
            <div className="flex gap-1.5 items-center">
              <input className="input" placeholder="Preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} aria-label="Preset name" />
              <button className="btn btn-primary" onClick={savePreset}>
                <Save size={13} /> Save preset
              </button>
            </div>
            {settings.presets.filter((p) => p.rideId === rideId).length > 0 && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Preset</th>
                    <th>Camera</th>
                    <th>Regions</th>
                    <th>Saved</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {settings.presets.filter((p) => p.rideId === rideId).map((p) => (
                    <tr key={p.id} className={p.id === activePresetId ? 'selected' : ''}>
                      <td>{p.name}</td>
                      <td className="mono">{p.cameraId}</td>
                      <td className="mono">{Object.keys(p.regions).length}</td>
                      <td className="text-graphite-300">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="text-right">
                        <button className="btn btn-xs" onClick={() => { settings.setActivePreset(rideId, p.id); setCamId(p.cameraId); }}>Activate</button>{' '}
                        <button className="btn btn-xs btn-danger" onClick={() => settings.deletePreset(p.id)} aria-label="Delete preset">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel title="Region table" bodyClassName="p-0 overflow-auto max-h-[200px]">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Seat</th>
                  <th>Label</th>
                  <th>x</th>
                  <th>y</th>
                  <th>w</th>
                  <th>h</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(regions).map(([id, r]) => (
                  <tr key={id} className={id === selectedSeat ? 'selected' : ''} onClick={() => setSelectedSeat(id)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{id}</td>
                    <td>{seatLabel(ride, id)}</td>
                    <td className="mono">{r.x.toFixed(3)}</td>
                    <td className="mono">{r.y.toFixed(3)}</td>
                    <td className="mono">{r.w.toFixed(3)}</td>
                    <td className="mono">{r.h.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-3 flex flex-col gap-3">
          <Panel title="System health (simulated)" bodyClassName="p-3 text-[11.5px] flex flex-col gap-2">
            <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold">Camera connectivity</div>
            {ride.cameras.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="mono">{c.id}</span>
                <span className="flex items-center gap-2">
                  <span className="mono text-graphite-300">{cameras[c.id]?.offline ? '—' : `${cameras[c.id]?.latencyMs ?? 40} ms`}</span>
                  <Badge tone={cameras[c.id]?.offline ? 'red' : cameras[c.id]?.degraded ? 'amber' : 'green'}>{cameras[c.id]?.offline ? 'offline' : cameras[c.id]?.degraded ? 'degraded' : 'online'}</Badge>
                </span>
              </div>
            ))}
            <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mt-1">Edge processor</div>
            <div className="flex justify-between"><span className="text-graphite-300">Status</span><Badge tone="green">processing (sim)</Badge></div>
            <div className="flex justify-between"><span className="text-graphite-300">Load</span><span className="mono">{edgeLoad}%</span></div>
            <div className="flex justify-between"><span className="text-graphite-300">Frame latency</span><span className="mono">{38 + Math.round(edgeLoad / 10)} ms</span></div>
            <div className="flex justify-between"><span className="text-graphite-300">Uptime</span><span className="mono">14d 03h (fictional)</span></div>
            <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mt-1">Observation engine</div>
            <div className="flex justify-between"><span className="text-graphite-300">State</span><Badge tone="teal">evaluating · {settings.mode}</Badge></div>
            <div className="flex justify-between"><span className="text-graphite-300">Frames evaluated</span><span className="mono">{frameCount}</span></div>
            <div className="flex justify-between"><span className="text-graphite-300">Threshold / frames</span><span className="mono">{Math.round(settings.evaluator.confidenceThreshold * 100)}% · {settings.evaluator.stabilizationFrames}/{settings.evaluator.escalationFrames}</span></div>
            <div className="text-[10.5px] uppercase tracking-wider text-graphite-300 font-semibold mt-1">Local storage</div>
            <div className="flex justify-between"><span className="text-graphite-300">Usage</span><span className="mono">{(storageBytes / 1024).toFixed(1)} KB</span></div>
            <div className="w-full h-1.5 bg-graphite-700 rounded overflow-hidden"><span className="block h-full bg-signal-teal" style={{ width: `${Math.min(100, (storageBytes / (5 * 1024 * 1024)) * 100)}%` }} /></div>
          </Panel>
          <Panel title="Read-only observation adapters (fictional)" bodyClassName="p-3 text-[11.5px] flex flex-col gap-1.5">
            {ride.sensors.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span>
                  <span className="mono">{s.id}</span> <span className="text-graphite-300">· {s.label}</span>
                </span>
                <Badge tone="violet">read-only</Badge>
              </div>
            ))}
            <div className="text-[10.5px] text-graphite-400 mt-1">No adapter writes to, signals, or controls any equipment. There is no ride-controller integration in this software.</div>
          </Panel>
          <Panel title="Alert configuration" bodyClassName="p-3 flex flex-col gap-1.5">
            {ALL_ALERT_TYPES.map((t) => (
              <Toggle key={t} label={ALERT_TYPE_LABEL[t]} checked={settings.enabledAlerts[t]} onChange={(v) => settings.setAlertEnabled(t, v)} />
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
