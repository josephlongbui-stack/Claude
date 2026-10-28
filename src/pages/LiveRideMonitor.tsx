import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSimulationStore } from '@/store/simulation';
import { getRide } from '@/domain/rides/configs';
import { CameraView } from '@/features/monitor/CameraView';
import { SeatMap } from '@/features/monitor/SeatMap';
import { SeatInspector } from '@/features/monitor/SeatInspector';
import { ObservationTimeline } from '@/features/monitor/ObservationTimeline';
import { AlertQueue } from '@/features/monitor/AlertQueue';
import { TryConditions } from '@/features/monitor/TryConditions';
import { NarrationStrip } from '@/features/monitor/NarrationStrip';
import { Badge, Panel } from '@/components/ui';
import type { Alert } from '@/domain/types';

export default function LiveRideMonitor() {
  const rideId = useSimulationStore((s) => s.rideId);
  const seats = useSimulationStore((s) => s.seats);
  const selectedSeatId = useSimulationStore((s) => s.selectedSeatId);
  const selectSeat = useSimulationStore((s) => s.selectSeat);
  const selectAlert = useSimulationStore((s) => s.selectAlert);
  const navigate = useNavigate();
  const ride = getRide(rideId);
  const slide = ride.geometry.kind === 'slide';

  useEffect(() => {
    if (slide) navigate('/water-slide', { replace: true });
  }, [slide, navigate]);

  if (slide) return null;

  const onInspect = (a: Alert): void => {
    selectAlert(a.id);
    if (a.target.kind === 'seat') selectSeat(a.target.seatId);
  };
  const seatCams = ride.cameras.filter((c) => c.coverage.length > 0 || c.view === 'gates');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-base font-semibold">{ride.name}</h1>
        <Badge tone="slate">{ride.typeLabel}</Badge>
        <Badge tone="slate">
          {ride.geometry.rows * ride.geometry.seatsPerRow} seats · {ride.cameras.length} cameras{ride.cameras[0]?.mode === 'infrared' ? ' · infrared' : ''}
        </Badge>
      </div>
      <NarrationStrip />
      <div className="grid grid-cols-12 gap-3 items-start">
        <div className="col-span-12 xl:col-span-7 flex flex-col gap-3 min-w-0">
          <div className="grid grid-cols-2 gap-2">
            {seatCams.map((c) => (
              <CameraView key={c.id} cameraId={c.id} highlight={selectedSeatId !== null && c.coverage.includes(selectedSeatId)} onSelectSeat={selectSeat} />
            ))}
          </div>
          <ObservationTimeline />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-7 min-h-[240px] max-h-[440px]">
              <AlertQueue rideId={rideId} onInspect={onInspect} />
            </div>
            <div className="md:col-span-5">
              <TryConditions />
            </div>
          </div>
        </div>
        <div className="col-span-12 xl:col-span-5 flex flex-col gap-3 min-w-0">
          <Panel title="Seats" bodyClassName="p-3">
            <SeatMap ride={ride} seats={seats} selectedSeatId={selectedSeatId} onSelect={selectSeat} />
          </Panel>
          <div className="min-h-[280px] max-h-[560px] flex">
            <div className="flex-1 min-w-0">
              <SeatInspector />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
