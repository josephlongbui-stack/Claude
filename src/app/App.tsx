import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import ParkOverview from '@/pages/ParkOverview';
import LiveRideMonitor from '@/pages/LiveRideMonitor';
import WaterSlideMonitor from '@/pages/WaterSlideMonitor';
import SmartBoarding from '@/pages/SmartBoarding';
import DispatchAnalytics from '@/pages/DispatchAnalytics';
import SafetyReview from '@/pages/SafetyReview';
import PredictiveMaintenance from '@/pages/PredictiveMaintenance';
import Workforce from '@/pages/Workforce';
import EvidenceReports from '@/pages/EvidenceReports';
import RideConfiguration from '@/pages/RideConfiguration';
import BusinessImpact from '@/pages/BusinessImpact';
import ModelReview from '@/pages/ModelReview';
import Pilot from '@/pages/Pilot';

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<ParkOverview />} />
        <Route path="/live-monitor" element={<LiveRideMonitor />} />
        <Route path="/water-slide" element={<WaterSlideMonitor />} />
        <Route path="/boarding" element={<SmartBoarding />} />
        <Route path="/dispatch" element={<DispatchAnalytics />} />
        <Route path="/safety-review" element={<SafetyReview />} />
        <Route path="/maintenance" element={<PredictiveMaintenance />} />
        <Route path="/workforce" element={<Workforce />} />
        <Route path="/evidence" element={<EvidenceReports />} />
        <Route path="/configuration" element={<RideConfiguration />} />
        <Route path="/business-impact" element={<BusinessImpact />} />
        <Route path="/model-review" element={<ModelReview />} />
        <Route path="/pilot" element={<Pilot />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
