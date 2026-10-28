import { useEffect, useRef } from 'react';
import type { TrainingSample } from '@/data/training';
import { EVENING_PALETTE, IR_PALETTE, VISIBLE_PALETTE, drawBracketBox, drawOcclusion, drawRestraint, drawRider, drawSeat, postProcess, tag } from '@/features/monitor/canvasKit';
import { getRide } from '@/domain/rides/configs';

const W = 320;
const H = 180;

/** Static synthetic frame for a model-review sample. */
export function SampleFrame({ sample }: { sample: TrainingSample }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = sample.visual.lighting === 'ir' ? IR_PALETTE : sample.visual.lighting === 'evening' ? EVENING_PALETTE : VISIBLE_PALETTE;
    const ride = getRide(sample.rideId);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 60, 0, H);
    g.addColorStop(0, palette.floorEdge);
    g.addColorStop(1, palette.floor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 60, W, H - 60);
    const x = 115;
    const y = 70;
    const w = 90;
    const h = 72;
    drawSeat(ctx, x, y, w, h, { palette, scale: 0.95, restraint: ride.restraint, restraintState: 'nominal', occupied: true });
    drawRider(ctx, x + w / 2, y + h * 0.7, { variant: sample.visual.variant, alpha: 1, palette, silhouette: true, scale: 0.95, leaning: sample.visual.posture === 'leaning', phone: sample.visual.object });
    drawRestraint(ctx, x, y, w, h, { palette, scale: 0.95, restraint: ride.restraint, restraintState: sample.modelLabel === 'concern' && !sample.visual.object ? 'concern' : 'nominal', occupied: true });
    const color = sample.modelLabel === 'concern' ? '#ef4444' : sample.modelLabel === 'review' ? '#f59e0b' : sample.modelLabel === 'unknown' ? '#a78bfa' : '#4ade80';
    drawBracketBox(ctx, x - 2, y - 40, w + 4, h + 40, color, 1.3);
    tag(ctx, `${sample.seatId} · ${sample.modelLabel} ${Math.round(sample.modelConfidence * 100)}%`, x - 2, y + h + 4, { color, font: '9px ui-monospace, Menlo, monospace' });
    if (sample.visual.occlusion > 0) drawOcclusion(ctx, x + w * (1 - sample.visual.occlusion) - 10, y - 30, w * sample.visual.occlusion + 30, h + 50, 'partial');
    postProcess(ctx, W, H, { noise: sample.visual.lighting === 'ir' ? 0.2 : 0.06, ir: palette.ir, t: 0, degraded: false });
    tag(ctx, `${sample.cameraId} · ${sample.id} · SYNTHETIC`, 6, 6, { color: palette.hud, font: '9px ui-monospace, Menlo, monospace' });
  }, [sample]);
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: `${W}/${H}`, display: 'block' }} className="rounded border border-graphite-700 bg-black" role="img" aria-label={`Synthetic frame ${sample.id}`} />;
}
