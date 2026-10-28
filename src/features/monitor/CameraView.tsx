import { useEffect, useRef } from 'react';
import { subscribeFrame, useSimulationStore } from '@/store/simulation';
import type { EngineSnapshot } from '@/domain/simulation/engine';
import { useSettingsStore } from '@/store/settings';
import { getRide } from '@/domain/rides/configs';
import { parseSeatId } from '@/domain/rides/seats';
import { simClock, simDate } from '@/domain/simulation/clock';
import type { CameraConfig, EvaluatedSeat, ScriptedSeat, SeatState } from '@/domain/types';
import { SEAT_STATE_COLOR } from '@/components/ui';
import { EVENING_PALETTE, IR_PALETTE, VISIBLE_PALETTE, drawDashedBox, drawHud, drawOcclusion, drawPose, drawRestraint, drawRider, drawSeat, drawBracketBox, easeIn, easeOut, postProcess, tag, type Palette } from './canvasKit';

const W = 640;
const H = 360;

interface SeatPlacement {
  seatId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  row: number;
}

function layoutSeats(cam: CameraConfig, seatsPerRow: number, mirrored: boolean): SeatPlacement[] {
  const rows = [...new Set(cam.coverage.map((id) => parseSeatId(id).row))];
  // nearest row first: front views see the lowest row nearest, rear views the highest.
  const nearestFirst = cam.view === 'rear' ? [...rows].sort((a, b) => b - a) : [...rows].sort((a, b) => a - b);
  const n = Math.max(1, nearestFirst.length);
  const seatsVisible = mirrored ? seatsPerRow / 2 : seatsPerRow;
  const out: SeatPlacement[] = [];
  nearestFirst.forEach((row, depth) => {
    const scale = Math.max(0.42, 1 - depth * (n > 3 ? 0.17 : 0.26));
    const rowW = 420 * scale;
    const seatW = (rowW - (seatsVisible - 1) * 10 * scale) / seatsVisible;
    const seatH = 74 * scale;
    const baseY = 318 - depth * (n > 3 ? 46 : 70);
    const x0 = (W - rowW) / 2 + (cam.view === 'side' ? 0 : 0);
    const seatIds = cam.coverage.filter((id) => parseSeatId(id).row === row).sort((a, b) => parseSeatId(a).seat - parseSeatId(b).seat);
    seatIds.forEach((seatId, i) => {
      out.push({ seatId, x: x0 + i * (seatW + 10 * scale), y: baseY - seatH, w: seatW, h: seatH, scale, row });
    });
  });
  // far rows first so near rows paint over them
  return out.sort((a, b) => a.scale - b.scale);
}

interface FadeMem {
  occupied: boolean;
  changedMs: number;
}

export function CameraView({ cameraId, highlight = false, onSelectSeat }: { cameraId: string; highlight?: boolean; onSelectSeat?: (seatId: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fadeRef = useRef<Map<string, FadeMem>>(new Map());
  const placementsRef = useRef<SeatPlacement[]>([]);

  const rideId = useSimulationStore((s) => s.rideId);
  const selectedSeatId = useSimulationStore((s) => s.selectedSeatId);
  const lighting = useSettingsStore((s) => s.lighting);
  const privacy = useSettingsStore((s) => s.privacySilhouettes);
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

    const draw = (snap: EngineSnapshot): void => {
    if (snap.rideId !== ride.id) return;
    const { seats, scripted, cameras, phase, phaseStartedMs, simMs, sessionMs, gates } = snap;
    const runtime = cameras[cam.id];

    const ir = cam.mode === 'infrared' || lighting === 'infrared';
    const palette: Palette = ir ? IR_PALETTE : lighting === 'evening' ? EVENING_PALETTE : VISIBLE_PALETTE;
    const clock = `${simDate(sessionMs)} ${simClock(sessionMs)}.${String(Math.floor((sessionMs % 1000) / 10)).padStart(2, '0')}`;

    // background
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);

    if (runtime?.offline) {
      ctx.fillStyle = '#0a0d12';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO SIGNAL — CAMERA OFFLINE (SIMULATED)', W / 2, H / 2);
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillText('Covered seats are reported as Unknown — review required', W / 2, H / 2 + 20);
      postProcess(ctx, W, H, { noise: 0.45, ir: false, t: simMs, degraded: false });
      drawHud(ctx, W, H, { cameraId: cam.id, label: cam.label, clock, latencyMs: 0, mode: 'offline', privacy: 'PRIVACY: silhouettes', offline: true, palette });
      return;
    }

    // platform & track
    const floorG = ctx.createLinearGradient(0, 120, 0, H);
    floorG.addColorStop(0, palette.floorEdge);
    floorG.addColorStop(1, palette.floor);
    ctx.fillStyle = floorG;
    ctx.fillRect(0, 120, W, H - 120);
    ctx.fillStyle = palette.floorEdge;
    ctx.fillRect(0, 118, W, 3);
    // perspective lines on the floor
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 9; i += 1) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + (i - 3) * 40, 120);
      ctx.lineTo(W / 2 + (i - 3) * 140, H);
      ctx.stroke();
    }

    if (cam.view === 'gates') {
      drawGatesScene(ctx, palette, ride.geometry.rows, phase, phaseStartedMs, simMs, gates, privacy);
    } else {
      // train motion offset
      let dx = 0;
      let alphaTrain = 1;
      if (phase === 'arriving') dx = (1 - easeOut((simMs - phaseStartedMs) / 4200)) * 520;
      if (phase === 'departing') dx = -easeIn((simMs - phaseStartedMs) / 3600) * 760;
      if (phase === 'idle' || phase === 'block_wait') alphaTrain = 0;
      if (cam.view === 'rear' || cam.view === 'side') dx = -dx;

      const placements = layoutSeats(cam, ride.geometry.seatsPerRow, Boolean(ride.geometry.mirrored));
      placementsRef.current = placements.map((p) => ({ ...p, x: p.x + dx }));

      // rails
      ctx.fillStyle = palette.rail;
      ctx.fillRect(0, 334, W, 3);
      ctx.fillRect(0, 344, W, 2);

      if (alphaTrain > 0) {
        ctx.save();
        ctx.globalAlpha = alphaTrain;
        // car bodies per row
        const rowsSeen = new Map<number, SeatPlacement[]>();
        for (const p of placements) rowsSeen.set(p.row, [...(rowsSeen.get(p.row) ?? []), p]);
        for (const [, ps] of [...rowsSeen.entries()].sort((a, b) => a[1][0].scale - b[1][0].scale)) {
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
          tag(ctx, `${ride.geometry.rowLabel.toUpperCase()} ${ps[0].row}`, minX - 10 * s + dx, y + ps[0].h * 0.62 - 15, { color: 'rgba(221,227,234,0.55)', bg: 'rgba(0,0,0,0.35)', font: `${Math.max(8, 9 * s)}px ui-monospace, Menlo, monospace` });
        }

        const now = simMs;
        for (const p of placements) {
          const x = p.x + dx;
          const sc = scripted[p.seatId] as ScriptedSeat | undefined;
          const ev = seats[p.seatId] as EvaluatedSeat | undefined;
          const occupied = sc?.occupancy === 'occupied';
          const mem = fadeRef.current.get(p.seatId);
          if (!mem || mem.occupied !== occupied) fadeRef.current.set(p.seatId, { occupied, changedMs: now });
          const m = fadeRef.current.get(p.seatId)!;
          const since = Math.max(0, now - m.changedMs);
          const alpha = occupied ? Math.min(1, since / 700) : Math.max(0, 1 - since / 700);
          const restraintState = sc?.restraint ?? 'not_applicable';
          drawSeat(ctx, x, p.y, p.w, p.h, { palette, scale: p.scale, restraint: ride.restraint, restraintState, occupied });
          let pose = null;
          if (alpha > 0) {
            pose = drawRider(ctx, x + p.w / 2, p.y + p.h * 0.7, { variant: sc?.riderVariant ?? 0, alpha, leaning: sc?.posture === 'unusual', phone: sc?.looseObject === 'detected' || sc?.looseObject === 'possible', palette, silhouette: privacy, scale: p.scale });
          }
          drawRestraint(ctx, x, p.y, p.w, p.h, { palette, scale: p.scale, restraint: ride.restraint, restraintState, occupied });

          // overlays
          const state: SeatState = ev?.state ?? 'unknown';
          const color = SEAT_STATE_COLOR[state];
          const selected = selectedSeatId === p.seatId;
          drawDashedBox(ctx, x - 3, p.y - 46 * p.scale, p.w + 6, p.h + 46 * p.scale, selected ? '#22d3ee' : 'rgba(34,211,238,0.28)');
          tag(ctx, p.seatId, x - 2, p.y - 46 * p.scale - 14, { color: selected ? '#22d3ee' : 'rgba(103,232,249,0.8)', bg: 'rgba(0,0,0,0.5)', font: '9px ui-monospace, Menlo, monospace' });
          if (occupied && ev && alpha > 0.5) {
            const occluded = ev.occluded;
            if (!occluded && pose && ev.confidence >= threshold * 0.6) drawPose(ctx, pose, state === 'unknown' ? '#a78bfa' : 'rgba(103,232,249,0.85)');
            drawBracketBox(ctx, x - 1, p.y - 40 * p.scale, p.w + 2, p.h * 0.72 + 40 * p.scale, color, state === 'concern' ? 2 : 1.2);
            const conf = `${Math.round(ev.confidence * 100)}%`;
            const confColor = ev.confidence < threshold ? '#fcd34d' : '#dde3ea';
            let ly = p.y + p.h * 0.72 + 2;
            tag(ctx, `person ${conf}`, x - 1, ly, { color: confColor, font: `${Math.max(8, 9.5 * p.scale)}px ui-monospace, Menlo, monospace` });
            ly += 13;
            if (state === 'unknown') tag(ctx, occluded ? 'UNKNOWN · occluded' : 'UNKNOWN · low conf', x - 1, ly, { color: '#c4b5fd', bg: 'rgba(30,20,60,0.85)', font: `${Math.max(8, 9.5 * p.scale)}px ui-monospace, Menlo, monospace` });
            else if (ev.restraint !== 'not_applicable') tag(ctx, `restraint: ${ev.restraint}`, x - 1, ly, { color: ev.restraint === 'concern' ? '#fca5a5' : ev.restraint === 'review' || ev.restraint === 'unknown' ? '#fcd34d' : '#86efac', font: `${Math.max(8, 9.5 * p.scale)}px ui-monospace, Menlo, monospace` });
            else tag(ctx, 'restraint: pending', x - 1, ly, { color: 'rgba(221,227,234,0.6)', font: `${Math.max(8, 9.5 * p.scale)}px ui-monospace, Menlo, monospace` });
            if (ev.looseObject === 'detected' || ev.looseObject === 'possible') {
              if (pose) {
                drawBracketBox(ctx, pose.rHand[0] - 9 * p.scale, pose.rHand[1] - 12 * p.scale, 18 * p.scale, 20 * p.scale, '#ef4444', 1.4);
                tag(ctx, `object: phone ${Math.round(ev.confidence * 100 - 4)}%`, pose.rHand[0] + 10 * p.scale, pose.rHand[1] - 14 * p.scale, { color: '#fca5a5', bg: 'rgba(60,10,10,0.85)', font: `${Math.max(8, 9 * p.scale)}px ui-monospace, Menlo, monospace` });
              }
            }
            if (ev.posture === 'unusual') {
              ly += 13;
              tag(ctx, 'posture: unusual', x - 1, ly, { color: '#fcd34d', font: `${Math.max(8, 9.5 * p.scale)}px ui-monospace, Menlo, monospace` });
            }
          } else if (ev && alpha <= 0.5 && ev.state === 'empty') {
            tag(ctx, 'empty', x - 1, p.y + p.h * 0.72 + 2, { color: 'rgba(221,227,234,0.5)', font: `${Math.max(8, 9.5 * p.scale)}px ui-monospace, Menlo, monospace` });
          }
        }
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(221,227,234,0.35)';
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STATION EMPTY — awaiting next arrival', W / 2, 230);
        ctx.textAlign = 'left';
      }
    }

    // occlusion overlay
    if (runtime?.occlusion) {
      const o = runtime.occlusion;
      drawOcclusion(ctx, o.x * W, o.y * H, o.w * W, o.h * H, o.label);
    }

    postProcess(ctx, W, H, { noise: runtime?.noise ?? 0.04, ir, t: simMs, degraded: Boolean(runtime?.degraded) });
    drawHud(ctx, W, H, { cameraId: cam.id, label: cam.label, clock, latencyMs: runtime?.latencyMs ?? 40, mode: ir ? 'IR 850nm' : lighting === 'evening' ? 'visible · low light' : 'visible', privacy: privacy ? 'PRIVACY: silhouettes' : 'PRIVACY: off', offline: false, palette, extra: runtime?.degraded ? 'DEGRADED · sharpness low' : undefined });
    };
    return subscribeFrame(draw);
  }, [cam, ride, selectedSeatId, lighting, privacy, threshold]);

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

function drawGatesScene(ctx: CanvasRenderingContext2D, palette: Palette, rows: number, phase: string, phaseStartedMs: number, simMs: number, gates: { gateId: string; atMs: number; openDurationMs: number }[], privacy: boolean): void {
  const n = Math.min(rows, 8);
  const gateW = Math.min(64, (W - 80) / n - 8);
  const x0 = (W - n * (gateW + 8)) / 2;
  const boarding = phase === 'boarding';
  const since = simMs - phaseStartedMs;
  const lastGate = gates[gates.length - 1];
  const slowGate = lastGate && lastGate.openDurationMs > 5000 ? lastGate : null;
  // queue rail
  ctx.fillStyle = palette.carEdge;
  ctx.fillRect(x0 - 20, 150, n * (gateW + 8) + 32, 2);
  for (let i = 0; i < n; i += 1) {
    const x = x0 + i * (gateW + 8);
    const letter = String.fromCharCode(65 + i);
    const isB = letter === 'B';
    const openDur = isB && slowGate ? slowGate.openDurationMs : 2100;
    const openP = boarding ? Math.min(1, since / openDur) : phase === 'observing' || phase === 'review' || phase === 'ready' || phase === 'dispatch' ? 0 : 0;
    const angle = boarding ? openP * 1.2 : 0;
    // gate posts
    ctx.fillStyle = palette.rail;
    ctx.fillRect(x, 150, 4, 70);
    ctx.fillRect(x + gateW - 4, 150, 4, 70);
    // gate leaf (rotates when opening)
    ctx.save();
    ctx.translate(x + 4, 190);
    ctx.rotate(-angle);
    ctx.fillStyle = isB && slowGate ? '#b45309' : '#6b7a90';
    ctx.fillRect(0, -4, gateW - 8, 8);
    ctx.restore();
    // waiting riders behind the gate (fade out as they board)
    const waiting = boarding ? Math.max(0, 1 - since / 9000) : phase === 'unloading' || phase === 'arriving' ? 1 : 0.15;
    if (waiting > 0.05) {
      for (let k = 0; k < 2; k += 1) {
        drawRider(ctx, x + gateW / 2 + (k === 0 ? -10 : 12), 140 - k * 8, { variant: (i + k) % 4, alpha: waiting * (k === 0 ? 1 : 0.7), palette, silhouette: privacy, scale: 0.55 - k * 0.08 });
      }
    }
    drawDashedBox(ctx, x - 2, 90, gateW + 4, 135, 'rgba(34,211,238,0.3)');
    tag(ctx, `GATE-${letter}`, x, 228, { color: isB && slowGate ? '#fcd34d' : 'rgba(221,227,234,0.8)', font: '9px ui-monospace, Menlo, monospace' });
    if (boarding) tag(ctx, `${(Math.min(since, openDur) / 1000).toFixed(1)}s`, x, 241, { color: isB && slowGate ? '#fcd34d' : '#86efac', font: '9px ui-monospace, Menlo, monospace' });
    if (isB && slowGate) {
      drawBracketBox(ctx, x - 4, 150, gateW + 8, 76, '#f59e0b', 1.5);
      tag(ctx, `SLOW GATE ${(slowGate.openDurationMs / 1000).toFixed(1)}s`, x - 4, 256, { color: '#fcd34d', bg: 'rgba(60,30,0,0.85)', font: '9px ui-monospace, Menlo, monospace' });
    }
  }
  tag(ctx, `platform zone · ${boarding ? 'boarding' : phase}`, 12, 290, { color: 'rgba(221,227,234,0.7)' });
}
