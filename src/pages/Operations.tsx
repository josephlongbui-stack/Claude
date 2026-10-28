import { useState } from 'react';
import { useSimulationStore } from '@/store/simulation';
import { DEFAULT_RIDE_ID, getRide, isSlide } from '@/domain/rides/configs';
import { SectionTitle, Tabs } from '@/components/ui';
import { DispatchTab } from '@/features/operations/DispatchTab';
import { BoardingTab } from '@/features/operations/BoardingTab';
import { MaintenanceTab } from '@/features/operations/MaintenanceTab';

type Tab = 'dispatch' | 'boarding' | 'maintenance';

export default function Operations() {
  const rideId = useSimulationStore((s) => s.rideId);
  const [tab, setTab] = useState<Tab>('dispatch');
  // Dispatch analytics are about trains, so the slide falls back to the coaster.
  const ride = getRide(isSlide(rideId) ? DEFAULT_RIDE_ID : rideId);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle sub="How the station is running, and what faster, fuller dispatches would be worth. All figures are synthetic projections, not measured results.">Operations · {ride.name}</SectionTitle>
      <Tabs
        tabs={[
          { id: 'dispatch', label: 'Dispatch' },
          { id: 'boarding', label: 'Boarding' },
          { id: 'maintenance', label: 'Maintenance' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'dispatch' && <DispatchTab key={ride.id} ride={ride} />}
      {tab === 'boarding' && <BoardingTab />}
      {tab === 'maintenance' && <MaintenanceTab />}
    </div>
  );
}
