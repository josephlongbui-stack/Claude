import { useEffect, useRef } from 'react';
import { subscribeFrame, useSimulationStore } from '@/store/simulation';
import { useSettingsStore } from '@/store/settings';
import type { EngineSnapshot } from '@/domain/simulation/engine';
import { getRide } from '@/domain/rides/configs';
import { parseSeatId } from '@/domain/rides/seats';
import { simClock } from '@/domain/simulation/clock';
import type { CameraConfig, GateObservation, ScriptedSeat, SeatState, StationPhase } from '@/domain/types';
import { SEAT_STATE_COLOR } from '@/components/ui';
import { IR_PALETTE, VISIBLE_PALETTE, drawBracketBox, drawDashedBox, drawHud, drawOcclusion, drawPose, drawRestraint, drawRider, drawSeat, easeIn, easeOut, postProcess, tag, type Palette } from './canvasKit';

const W = 640;
const H = 360;
const FADE_MS = 700;

interface SeatPlacement {
  seatId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  row: number;
}

/** Perspective layout: the nearest row is largest and lowest in the frame. */
function layoutSeats(cam: CameraConfig, seatsPerRow: number): SeatPlacement[] {
  const rows = [...new Set(cam.coverage.map((id) => parseSeatId(id).row))];
  const nearestFirst = cam.view === 'rear' ? [...rows].sort((a, b) => b - a) : [...rows].sort((a, b) => a - b);
  const n = Math.max(1, nearestFirst.length);
  const seatsVisible = cam.view === 'side' ? cam.coverage.length : seatsPerRow;
  const out: SeatPlacement[] = [];
  nearestFirst.forEach((row, depth) => {
    const scale = Math.max(0.42, 1 - depth * (n > 3 ? 0.17 : 0.26));
    const rowW = 420 * scale;
    const seatW = (rowW - (seatsVisible - 1) * 10 * scale) / seatsVisible;
    const seatH = 74 * scale;
    const baseY = 318 - depth * (n > 3 ? 46 : 70);
    const x0 = (W - rowW) / 2;
    const ids = cam.coverage.filter((id) => parseSeatId(id).row === row).sort((a, b) => parseSeatId(a).seat - parseSeatId(b).seat);
    ids.forEach((seatId, i) => out.push({ seatId, x: x0 + i * (seatW + 10 * scale), y: baseY - seatH, w: seatW, h: seatH, scale, row }));
  });
  return out.sort((a, b) => a.scale - b.scale); // far rows first so near rows paint over them
}

export function CameraView({ cameraId, highlight = false, onSelectSeat }: { cameraId: string; highlight?: boolean; onSelectSeat?: (seatId: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fadeRef = useRef<Map<string, { occupied: boolean; changedMs: number }>>(new Map());
  const placementsRef = useRef<SeatPlacement[]>([]);

  const rideId = useSimulationStore((s) => s.rideId);
  const selectedSeatId = useSimulationStore((s) => s.selectedSeatId);
  const threshold = useSettingsStore((s) => s.evaluator.confidenceThreshold);
  const ride = getRide(rideId);
  const cam = ride.cameras.find((c) => c.id === cameraId) ?? ride.cameras[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ir = cam.mode === 'infrared';
    const palette: Palette = ir ? IR_PALETTE : VISIBLE_PALETTE;

    const draw = (snap: EngineSnapshot): void => {
      if (snap.rideId !== ride.id) return;
      const { seats, scripted, cameras, phase, phaseStartedMs, simMs, sessionMs, gates } = snap;
      const runtime = cameras[cam.id];
      const clock = `${simClock(sessionMs)}.${String(Math.floor((sessionMs % 1000) / 10)).padStart(2, '0')}`;

      // Floor and track
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      const floorG = ctx.createLinearGradient(0, 120, 0, H);
      floorG.addColorStop(0, palette.floorEdge);
      floorG.addColorStop(1, palette.floor);
      ctx.fillStyle = floorG;
      ctx.fillRect(0, 120, W, H - 120);
      ctx.fillStyle = palette.floorEdge;
      ctx.fillRect(0, 118, W, 3);

      if (cam.view === 'gates') {
        drawGatesScene(ctx, palette, ride.geometry.rows, phase, phaseStartedMs, simMs, gates);
      } else {
        let dx = 0;
        if (phase === 'arriving') dx = (1 - easeOut((simMs - phaseStartedMs) / 4200)) * 520;
        if (phase === 'departing') dx = -easeIn((simMs - phaseStartedMs) / 3600) * 760;
        if (cam.view === 'rear') dx = -dx;
        const trainVisible = phase !== 'idle';

        const placements = layoutSeats(cam, ride.geometry.seatsPerRow);
        placementsRef.current = placements.map((p) => ({ ...p, x: p.x + dx }));
        ctx.fillStyle = palette.rail;
        ctx.fillRect(0, 334, W, 3);
        ctx.fillRect(0, 344, W, 2);

        if (trainVisible) {
          drawCarBodies(ctx, palette, placements, dx, ride.geometry.rowLabel);
          for (const p of placements) {
            const x = p.x + dx;
            const sc = scripted[p.seatId] as ScriptedSeat | undefined;
            const ev = seats[p.seatId];
            const occupied = sc?.occupancy === 'occupied';
            const mem = fadeRef.current.get(p.seatId);
            // A real occupancy change fades; a first sighting or a reset (clock went backwards) shows the settled state.
            if (!mem || mem.occupied !== occupied || simMs < mem.changedMs) fadeRef.current.set(p.seatId, { occupied, changedMs: mem && mem.occupied !== occupied ? simMs : -FADE_MS });
            const since = simMs - fadeRef.current.get(p.seatId)!.changedMs;
            const alpha = occupied ? Math.min(1, since / FADE_MS) : Math.max(0, 1 - since / FADE_MS);
            const restraintState = sc?.restraint ?? 'not_applicable';
            const drawOpts = { palette, scale: p.scale, restraint: ride.restraint, restraintState, occupied };
            drawSeat(ctx, x, p.y, p.w, p.h, drawOpts);
            const pose = alpha > 0 ? drawRider(ctx, x + p.w / 2, p.y + p.h * 0.7, { variant: sc?.riderVariant ?? 0, alpha, leaning: sc?.posture === 'unusual', phone: sc?.looseObject === 'detected' || sc?.looseObject === 'possible', palette, silhouette: true, scale: p.scale }) : null;
            drawRestraint(ctx, x, p.y, p.w, p.h, drawOpts);

            // Overlay: region, detection box, labels
            const state: SeatState = ev?.state ?? 'unknown';
            const color = SEAT_STATE_COLOR[state];
            const selected = selectedSeatId === p.seatId;
            const font = `${Math.max(8, 9.5 * p.scale)}px ui-monospace, Menlo, monospace`;
            drawDashedBox(ctx, x - 3, p.y - 46 * p.scale, p.w + 6, p.h + 46 * p.scale, selected ? '#22d3ee' : 'rgba(34,211,238,0.28)');
            tag(ctx, p.seatId, x - 2, p.y - 46 * p.scale - 14, { color: selected ? '#22d3ee' : 'rgba(103,232,249,0.8)', bg: 'rgba(0,0,0,0.5)', font: '9px ui-monospace, Menlo, monospace' });
            if (occupied && ev && alpha > 0.5) {
              if (!ev.occluded && pose && ev.confidence >= threshold * 0.6) drawPose(ctx, pose, state === 'unknown' ? '#a78bfa' : 'rgba(103,232,249,0.85)');
              drawBracketBox(ctx, x - 1, p.y - 40 * p.scale, p.w + 2, p.h * 0.72 + 40 * p.scale, color, state === 'concern' ? 2 : 1.2);
              let ly = p.y + p.h * 0.72 + 2;
              tag(ctx, `person ${Math.round(ev.confidence * 100)}%`, x - 1, ly, { color: ev.confidence < threshold ? '#fcd34d' : '#dde3ea', font });
              ly += 13;
              if (state === 'unknown') tag(ctx, ev.occluded ? 'UNKNOWN · blocked' : 'UNKNOWN · low conf', x - 1, ly, { color: '#c4b5fd', bg: 'rgba(30,20,60,0.85)', font });
              else if (ev.restraint === 'not_applicable') tag(ctx, 'restraint: up', x - 1, ly, { color: 'rgba(221,227,234,0.6)', font });
              else tag(ctx, `restraint: ${ev.restraint}`, x - 1, ly, { color: ev.restraint === 'concern' ? '#fca5a5' : ev.restraint === 'nominal' ? '#86efac' : '#fcd34d', font });
              if ((ev.looseObject === 'detected' || ev.looseObject === 'possible') && pose) {
                drawBracketBox(ctx, pose.rHand[0] - 9 * p.scale, pose.rHand[1] - 12 * p.scale, 18 * p.scale, 20 * p.scale, '#ef4444', 1.4);
                tag(ctx, 'phone', pose.rHand[0] + 10 * p.scale, pose.rHand[1] - 14 * p.scale, { color: '#fca5a5', bg: 'rgba(60,10,10,0.85)', font });
              }
            } else if (ev?.state === 'empty' && alpha <= 0.5) {
              tag(ctx, 'empty', x - 1, p.y + p.h * 0.72 + 2, { color: 'rgba(221,227,234,0.5)', font });
            }
          }
        } else {
          ctx.fillStyle = 'rgba(221,227,234,0.35)';
          ctx.font = '11px ui-monospace, Menlo, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('STATION EMPTY — waiting for the next arrival', W / 2, 230);
          ctx.textAlign = 'left';
        }
      }

      if (runtime?.occlusion) {
        const o = runtime.occlusion;
        drawOcclusion(ctx, o.x * W, o.y * H, o.w * W, o.h * H, o.label);
      }
      postProcess(ctx, W, H, { noise: runtime?.noise ?? 0.04, ir, t: simMs, degraded: false });
      drawHud(ctx, W, H, { cameraId: cam.id, label: cam.label, clock, latencyMs: runtime?.latencyMs ?? 40, mode: ir ? 'infrared' : 'visible', privacy: 'silhouettes only', offline: false, palette });
    };
    return subscribeFrame(draw);
  }, [cam, ride, selectedSeatId, threshold]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!onSelectSeat) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    const hit = [...placementsRef.current].reverse().find((p) => x >= p.x - 3 && x <= p.x + p.w + 3 && y >= p.y - 46 * p.scale && y <= p.y + p.h);
    if (hit) onSelectSeat(hit.seatId);
  };

  return (
    <div className={`relative rounded border ${highlight ? 'border-signal-teal' : 'border-graphite-700'} bg-black overflow-hidden`}>
      <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: `${W}/${H}`, display: 'block', cursor: onSelectSeat ? 'crosshair' : 'default' }} onClick={handleClick} role="img" aria-label={`${cam.id} ${cam.label} simulated camera view`} />
    </div>
  );
}

function drawCarBodies(ctx: CanvasRenderingContext2D, palette: Palette, placements: SeatPlacement[], dx: number, rowLabel: string): void {
  const byRow = new Map<number, SeatPlacement[]>();
  for (const p of placements) byRow.set(p.row, [...(byRow.get(p.row) ?? []), p]);
  for (const ps of [...byRow.values()].sort((a, b) => a[0].scale - b[0].scale)) {
    const minX = Math.min(...ps.map((p) => p.x));
    const maxX = Math.max(...ps.map((p) => p.x + p.w));
    const s = ps[0].scale;
    const y = ps[0].y + ps[0].h * 0.55;
    ctx.fillStyle = palette.carBody;
    ctx.strokeStyle = palette.carEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(minX - 14 * s + dx, y, maxX - minX + 28 * s, ps[0].h * 0.62, 6 * s);
    ctx.fill();
    ctx.stroke();
    if (rowLabel !== 'Seat') tag(ctx, `${rowLabel.toUpperCase()} ${ps[0].row}`, minX - 10 * s + dx, y + ps[0].h * 0.62 - 15, { color: 'rgba(221,227,234,0.55)', bg: 'rgba(0,0,0,0.35)', font: `${Math.max(8, 9 * s)}px ui-monospace, Menlo, monospace` });
  }
}

function drawGatesScene(ctx: CanvasRenderingContext2D, palette: Palette, rows: number, phase: StationPhase, phaseStartedMs: number, simMs: number, gates: GateObservation[]): void {
  const n = Math.min(rows, 8);
  const gateW = Math.min(64, (W - 80) / n - 8);
  const x0 = (W - n * (gateW + 8)) / 2;
  const boarding = phase === 'boarding';
  const since = simMs - phaseStartedMs;
  const lastGate = gates[gates.length - 1];
  const slowGate = lastGate && lastGate.openDurationMs > 5000 ? lastGate : null;
  ctx.fillStyle = palette.carEdge;
  ctx.fillRect(x0 - 20, 150, n * (gateW + 8) + 32, 2);
  for (let i = 0; i < n; i += 1) {
    const x = x0 + i * (gateW + 8);
    const letter = String.fromCharCode(65 + i);
    const isSlow = letter === 'B' && slowGate;
    const openDur = isSlow ? slowGate.openDurationMs : 2100;
    const angle = boarding ? Math.min(1, since / openDur) * 1.2 : 0;
    ctx.fillStyle = palette.rail;
    ctx.fillRect(x, 150, 4, 70);
    ctx.fillRect(x + gateW - 4, 150, 4, 70);
    ctx.save();
    ctx.translate(x + 4, 190);
    ctx.rotate(-angle);
    ctx.fillStyle = isSlow ? '#b45309' : '#6b7a90';
    ctx.fillRect(0, -4, gateW - 8, 8);
    ctx.restore();
    const waiting = boarding ? Math.max(0, 1 - since / 9000) : phase === 'unloading' || phase === 'arriving' ? 1 : 0.15;
    if (waiting > 0.05) {
      for (let k = 0; k < 2; k += 1) drawRider(ctx, x + gateW / 2 + (k === 0 ? -10 : 12), 140 - k * 8, { variant: (i + k) % 4, alpha: waiting * (k === 0 ? 1 : 0.7), palette, silhouette: true, scale: 0.55 - k * 0.08 });
    }
    drawDashedBox(ctx, x - 2, 90, gateW + 4, 135, 'rgba(34,211,238,0.3)');
    tag(ctx, `GATE-${letter}`, x, 228, { color: isSlow ? '#fcd34d' : 'rgba(221,227,234,0.8)', font: '9px ui-monospace, Menlo, monospace' });
    if (boarding) tag(ctx, `${(Math.min(since, openDur) / 1000).toFixed(1)}s`, x, 241, { color: isSlow ? '#fcd34d' : '#86efac', font: '9px ui-monospace, Menlo, monospace' });
    if (isSlow) {
      drawBracketBox(ctx, x - 4, 150, gateW + 8, 76, '#f59e0b', 1.5);
      tag(ctx, `SLOW GATE ${(slowGate.openDurationMs / 1000).toFixed(1)}s`, x - 4, 256, { color: '#fcd34d', bg: 'rgba(60,30,0,0.85)', font: '9px ui-monospace, Menlo, monospace' });
    }
  }
}
