import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Clock3 } from 'lucide-react';
import { NAV_ITEMS } from './nav';
import { GuidedControls } from '@/components/GuidedControls';
import { SimulationBanner } from '@/components/SimulationBanner';
import { useSimulationStore } from '@/store/simulation';
import { useRecordsStore } from '@/store/records';
import { PARK, RIDES, isSlide } from '@/domain/rides/configs';
import { simClock } from '@/domain/simulation/clock';
import { isOpen } from '@/domain/review/workflow';

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const rideId = useSimulationStore((s) => s.rideId);
  const sessionMs = useSimulationStore((s) => s.sessionMs);
  const pendingRoute = useSimulationStore((s) => s.pendingRoute);
  const openAlerts = useRecordsStore((s) => s.alerts.filter(isOpen).length);

  // Start the first scenario once.
  useEffect(() => {
    const st = useSimulationStore.getState();
    if (!st.scenarioId) st.loadScenario('A', { autoplay: true });
  }, []);

  // Follow scenario-driven navigation (guided demo).
  useEffect(() => {
    if (!pendingRoute) return;
    const route = useSimulationStore.getState().consumeRoute();
    if (route && route !== location.pathname) navigate(route);
  }, [pendingRoute, location.pathname, navigate]);

  const chooseRide = (id: string): void => {
    useSimulationStore.getState().setRide(id);
    const onMonitor = location.pathname === '/live-monitor' || location.pathname === '/water-slide';
    if (onMonitor) navigate(isSlide(id) ? '/water-slide' : '/live-monitor');
  };

  return (
    <div className="h-full flex bg-graphite-950 text-graphite-100">
      <aside className="w-[52px] lg:w-[190px] shrink-0 border-r border-graphite-700 bg-graphite-900 flex flex-col">
        <div className="px-3 lg:px-4 py-3 border-b border-graphite-700 flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-graphite-800 border border-graphite-600 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden>
              <path d="M6 20c4-10 16-10 20 0" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <circle cx="16" cy="12" r="2.5" fill="#22d3ee" />
              <rect x="8" y="22" width="16" height="3" rx="1.5" fill="#64748b" />
            </svg>
          </div>
          <div className="leading-tight hidden lg:block">
            <div className="text-[13px] font-semibold tracking-tight">RideOps AI</div>
            <div className="text-[10px] text-graphite-300">{PARK.name}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} title={item.label} className={({ isActive }) => `flex items-center gap-2.5 px-4 py-[7px] text-[12.5px] border-l-2 transition-colors ${isActive ? 'border-signal-teal text-graphite-100 bg-graphite-800' : 'border-transparent text-graphite-300 hover:text-graphite-100 hover:bg-graphite-850'}`}>
              <item.icon size={15} className="shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
              {item.to === '/review-log' && openAlerts > 0 && <span className="ml-auto badge badge-amber !py-0 hidden lg:inline-flex">{openAlerts}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-graphite-700 text-[10.5px] text-graphite-400 leading-snug hidden lg:block">Synthetic data only. Not connected to any ride.</div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 shrink-0 border-b border-graphite-700 bg-graphite-900 flex items-center gap-3 px-3 whitespace-nowrap overflow-x-auto">
          <select aria-label="Ride" className="select !w-auto !py-1 !text-[12px]" value={rideId} onChange={(e) => chooseRide(e.target.value)}>
            {RIDES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.typeLabel}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-1.5 text-[11.5px] text-graphite-300 mono" title="Simulation clock">
            <Clock3 size={13} className="text-signal-teal" />
            <span className="text-graphite-100">{simClock(sessionMs)}</span>
          </span>
          <NavLink to="/review-log" className="flex items-center gap-1.5 text-[11.5px] text-graphite-300 hover:text-graphite-100" title="Open review items">
            <Bell size={13} className={openAlerts ? 'text-signal-amber' : 'text-graphite-400'} />
            <span className="num">{openAlerts} to review</span>
          </NavLink>
          <div className="ml-auto">
            <GuidedControls />
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
