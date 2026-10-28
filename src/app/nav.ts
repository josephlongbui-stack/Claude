import type { LucideIcon } from 'lucide-react';
import { Activity, BarChart3, BrainCircuit, Briefcase, ClipboardCheck, Database, Grid2x2, LayoutDashboard, Rocket, ShieldCheck, Users, Waves, Wrench } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: 'Operations' | 'Safety & Quality' | 'Platform';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Park Overview', icon: LayoutDashboard, group: 'Operations' },
  { to: '/live-monitor', label: 'Live Ride Monitor', icon: Activity, group: 'Operations' },
  { to: '/water-slide', label: 'Water Slide Monitor', icon: Waves, group: 'Operations' },
  { to: '/boarding', label: 'Smart Boarding', icon: Grid2x2, group: 'Operations' },
  { to: '/dispatch', label: 'Dispatch Analytics', icon: BarChart3, group: 'Operations' },
  { to: '/safety-review', label: 'Safety Review', icon: ShieldCheck, group: 'Safety & Quality' },
  { to: '/maintenance', label: 'Predictive Maintenance', icon: Wrench, group: 'Safety & Quality' },
  { to: '/workforce', label: 'Workforce & Training', icon: Users, group: 'Safety & Quality' },
  { to: '/evidence', label: 'Evidence & Reports', icon: Database, group: 'Safety & Quality' },
  { to: '/configuration', label: 'Ride Configuration', icon: ClipboardCheck, group: 'Platform' },
  { to: '/business-impact', label: 'Business Impact', icon: Briefcase, group: 'Platform' },
  { to: '/model-review', label: 'Model Review Data', icon: BrainCircuit, group: 'Platform' },
  { to: '/pilot', label: 'Pilot & Deployment', icon: Rocket, group: 'Platform' },
];
