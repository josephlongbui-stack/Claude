import type { LucideIcon } from 'lucide-react';
import { Activity, Briefcase, ClipboardCheck, Gauge, LayoutDashboard, Waves } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/live-monitor', label: 'Live Monitor', icon: Activity },
  { to: '/water-slide', label: 'Water Slide', icon: Waves },
  { to: '/review-log', label: 'Review Log', icon: ClipboardCheck },
  { to: '/operations', label: 'Operations', icon: Gauge },
  { to: '/business-case', label: 'Business Case', icon: Briefcase },
];
