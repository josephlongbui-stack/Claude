import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import Overview from '@/pages/Overview';
import LiveRideMonitor from '@/pages/LiveRideMonitor';
import WaterSlideMonitor from '@/pages/WaterSlideMonitor';
import ReviewLog from '@/pages/ReviewLog';
import Operations from '@/pages/Operations';
import BusinessCase from '@/pages/BusinessCase';

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="/live-monitor" element={<LiveRideMonitor />} />
        <Route path="/water-slide" element={<WaterSlideMonitor />} />
        <Route path="/review-log" element={<ReviewLog />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/business-case" element={<BusinessCase />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
