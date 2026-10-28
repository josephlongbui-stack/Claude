import { useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Clock3, Radio } from 'lucide-react';
import { NAV_ITEMS } from './nav';
import { DemoControls } from '@/components/DemoControls';
import { SimulationBanner } from '@/components/SimulationBanner';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { useSettingsStore } from '@/store/settings';
import { PARKS, ridesForPark } from '@/domain/rides/configs';
import { simClock, simDate } from '@/domain/simulation/clock';
import { isOpen } from '@/domain/review/workflow';

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const parkId = useSimulationStore((s) => s.parkId);
  const rideId = useSimulationStore((s) => s.rideId);
  const sessionMs = useSimulationStore((s) => s.sessionMs);
  const pendingRoute = useSimulationStore((s) => s.pendingRoute);
  const connection = useSimulationStore((s) => s.connection);
  const mode = useSettingsStore((s) => s.mode);
  const setMode = useSettingsStore((s) => s.setMode);
  const openAlerts = useRecordsStore((s) => s.alerts.filter(isOpen).length);
  const rides = useMemo(() => ridesForPark(parkId), [parkId]);

  // Boot the engine once.
  useEffect(() => {
    const st = useSimulationStore.getState();
    if (!st.scenarioId) st.loadScenario('A', { autoplay: true });
  }, []);

  // Scenario-driven navigation (guided demo and scenario selector).
  useEffect(() => {
    if (!pendingRoute) return;
    const route = useSimulationStore.getState().consumeRoute();
    if (route && route !== location.pathname) navigate(route);
  }, [pendingRoute, location.pathname, navigate]);

  const groups = ['Operations', 'Safety & Quality', 'Platform'] as const;

  return (
    <div className="h-full flex bg-graphite-950 text-graphite-100">
      <aside className="w-[212px] shrink-0 border-r border-graphite-700 bg-graphite-900 flex flex-col">
        <div className="px-4 py-3 border-b border-graphite-700 flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-graphite-800 border border-graphite-600 flex items-center justify-center">
            <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden>
              <path d="M6 20c4-10 16-10 20 0" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <circle cx="16" cy="12" r="2.5" fill="#22d3ee" />
              <rect x="8" y="22" width="16" height="3" rx="1.5" fill="#64748b" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">RideOps AI</div>
            <div className="text-[10px] text-graphite-300 uppercase tracking-wider">Operations Intelligence</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Primary">
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-graphite-400 font-semibold">{g}</div>
              {NAV_ITEMS.filter((n) => n.group === g).map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex items-center gap-2.5 px-4 py-[6px] text-[12.5px] border-l-2 transition-colors ${isActive ? 'border-signal-teal text-graphite-100 bg-graphite-800' : 'border-transparent text-graphite-300 hover:text-graphite-100 hover:bg-graphite-850'}`}>
                  <item.icon size={15} className="shrink-0" />
                  <span>{item.label}</span>
                  {item.to === '/safety-review' && openAlerts > 0 && <span className="ml-auto badge badge-amber !py-0">{openAlerts}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-graphite-700 text-[10.5px] text-graphite-400 leading-snug">
          Demo build · synthetic data only. No ride-controller connectivity exists in this software.
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 shrink-0 border-b border-graphite-700 bg-graphite-900 flex items-center gap-2 px-3 whitespace-nowrap overflow-x-auto">
          <select aria-label="Park" className="select !w-auto !py-1 !text-[11.5px]" value={parkId} onChange={(e) => useSimulationStore.getState().setPark(e.target.value)}>
            {PARKS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select aria-label="Ride" className="select !w-auto !py-1 !text-[11.5px]" value={rideId} onChange={(e) => useSimulationStore.getState().setRide(e.target.value)}>
            {rides.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-1.5 text-[11px] text-graphite-300 px-2 border-l border-graphite-700" title="Simulated connection status">
            <Radio size={13} className={connection === 'simulated' ? 'text-signal-green' : 'text-signal-amber'} />
            <span className="hidden 2xl:inline">{connection === 'simulated' ? 'Sim link' : 'Reconnecting'}</span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-graphite-300 px-2 border-l border-graphite-700 mono" title="Simulation clock">
            <Clock3 size={13} className="text-signal-teal" />
            <span className="hidden 2xl:inline">{simDate(sessionMs)}</span>
            <span className="text-graphite-100">{simClock(sessionMs)}</span>
          </span>
          <div className="flex items-center rounded border border-graphite-600 overflow-hidden text-[11px]" role="radiogroup" aria-label="Demo mode">
            {(['shadow', 'assisted'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`px-2 py-1 capitalize ${mode === m ? 'bg-graphite-700 text-graphite-100' : 'text-graphite-300 hover:text-graphite-100'}`}>
                {m === 'shadow' ? 'Shadow' : 'Assisted'}
              </button>
            ))}
          </div>
          <NavLink to="/safety-review" className="flex items-center gap-1.5 text-[11px] text-graphite-300 px-2 border-l border-graphite-700 hover:text-graphite-100" title="Open alerts">
            <Bell size={13} className={openAlerts ? 'text-signal-amber' : 'text-graphite-400'} />
            <span className="num">{openAlerts} open</span>
          </NavLink>
          <div className="ml-auto">
            <DemoControls />
          </div>
        </header>
        <div className="px-3 pt-2">
          <SimulationBanner />
        </div>
        <main className="flex-1 min-h-0 overflow-auto p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
