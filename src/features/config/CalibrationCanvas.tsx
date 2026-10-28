import { useEffect, useRef, useState } from 'react';
import type { CameraConfig, RideConfiguration } from '@/domain/types';
import { parseSeatId } from '@/domain/rides/seats';
import type { CalibrationRegion } from '@/store/settings';
import { IR_PALETTE, VISIBLE_PALETTE, drawDashedBox, drawHud, drawRestraint, drawSeat, postProcess, tag } from '@/features/monitor/canvasKit';

const W = 640;
const H = 360;

export function defaultRegions(ride: RideConfiguration, cam: CameraConfig): Record<string, CalibrationRegion> {
  const rows = [...new Set(cam.coverage.map((id) => parseSeatId(id).row))];
  const nearestFirst = cam.view === 'rear' ? [...rows].sort((a, b) => b - a) : [...rows].sort((a, b) => a - b);
  const n = Math.max(1, nearestFirst.length);
  const seatsVisible = ride.geometry.mirrored ? ride.geometry.seatsPerRow / 2 : ride.geometry.seatsPerRow;
  const out: Record<string, CalibrationRegion> = {};
  nearestFirst.forEach((row, depth) => {
    const scale = Math.max(0.42, 1 - depth * (n > 3 ? 0.17 : 0.26));
    const rowW = 420 * scale;
    const seatW = (rowW - (seatsVisible - 1) * 10 * scale) / seatsVisible;
    const seatH = 74 * scale;
    const baseY = 318 - depth * (n > 3 ? 46 : 70);
    const x0 = (W - rowW) / 2;
    const ids = cam.coverage.filter((id) => parseSeatId(id).row === row).sort((a, b) => parseSeatId(a).seat - parseSeatId(b).seat);
    ids.forEach((id, i) => {
      out[id] = { x: (x0 + i * (seatW + 10 * scale) - 3) / W, y: (baseY - seatH - 46 * scale) / H, w: (seatW + 6) / W, h: (seatH + 46 * scale) / H };
    });
  });
  return out;
}

export function CalibrationCanvas({ ride, cam, regions, selectedSeat, onRegion, infrared }: { ride: RideConfiguration; cam: CameraConfig; regions: Record<string, CalibrationRegion>; selectedSeat: string | null; onRegion: (seatId: string, r: CalibrationRegion) => void; infrared: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = infrared || cam.mode === 'infrared' ? IR_PALETTE : VISIBLE_PALETTE;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);
    const floorG = ctx.createLinearGradient(0, 120, 0, H);
    floorG.addColorStop(0, palette.floorEdge);
    floorG.addColorStop(1, palette.floor);
    ctx.fillStyle = floorG;
    ctx.fillRect(0, 120, W, H - 120);
    ctx.fillStyle = palette.rail;
    ctx.fillRect(0, 334, W, 3);
    const base = defaultRegions(ride, cam);
    for (const r of Object.values(base)) {
      const x = r.x * W + 3;
      const w = r.w * W - 6;
      const h = (r.h * H) / 1.62;
      const y = r.y * H + r.h * H - h;
      const scale = w / 100;
      drawSeat(ctx, x, y, w, h, { palette, scale, restraint: ride.restraint, restraintState: 'nominal', occupied: false });
      drawRestraint(ctx, x, y, w, h, { palette, scale, restraint: ride.restraint, restraintState: 'nominal', occupied: false });
    }
    for (const [id, r] of Object.entries(regions)) {
      const sel = id === selectedSeat;
      drawDashedBox(ctx, r.x * W, r.y * H, r.w * W, r.h * H, sel ? '#22d3ee' : 'rgba(34,211,238,0.45)');
      tag(ctx, id, r.x * W, r.y * H - 14, { color: sel ? '#22d3ee' : 'rgba(103,232,249,0.8)', font: '9px ui-monospace, Menlo, monospace' });
    }
    if (drag) {
      const x = Math.min(drag.x0, drag.x1);
      const y = Math.min(drag.y0, drag.y1);
      ctx.save();
      ctx.fillStyle = 'rgba(245,158,11,0.15)';
      ctx.fillRect(x, y, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
      ctx.strokeStyle = '#f59e0b';
      ctx.strokeRect(x, y, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
      ctx.restore();
    }
    postProcess(ctx, W, H, { noise: 0.05, ir: palette.ir, t: 0, degraded: false });
    drawHud(ctx, W, H, { cameraId: cam.id, label: `${cam.label} · calibration frame`, clock: 'STATIC SYNTHETIC FRAME', latencyMs: 0, mode: palette.ir ? 'IR 850nm' : 'visible', privacy: selectedSeat ? `drag to set region for ${selectedSeat}` : 'select a seat to draw', offline: false, palette });
  }, [ride, cam, regions, selectedSeat, drag, infrared]);

  const pos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  return (
    <div className="rounded border border-graphite-700 overflow-hidden bg-black">
      <canvas
        ref={ref}
        style={{ width: '100%', aspectRatio: `${W}/${H}`, display: 'block', cursor: selectedSeat ? 'crosshair' : 'not-allowed' }}
        role="img"
        aria-label="Calibration frame — drag to draw an observation region"
        onMouseDown={(e) => {
          if (!selectedSeat) return;
          const p = pos(e);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onMouseMove={(e) => {
          if (!drag) return;
          const p = pos(e);
          setDrag({ ...drag, x1: p.x, y1: p.y });
        }}
        onMouseUp={() => {
          if (!drag || !selectedSeat) return;
          const x = Math.min(drag.x0, drag.x1);
          const y = Math.min(drag.y0, drag.y1);
          const w = Math.abs(drag.x1 - drag.x0);
          const h = Math.abs(drag.y1 - drag.y0);
          if (w > 8 && h > 8) onRegion(selectedSeat, { x: x / W, y: y / H, w: w / W, h: h / H });
          setDrag(null);
        }}
        onMouseLeave={() => setDrag(null)}
      />
    </div>
  );
}
