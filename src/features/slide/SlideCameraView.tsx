import { useEffect, useRef } from 'react';
import { subscribeFrame } from '@/store/simulation';
import type { EngineSnapshot } from '@/domain/simulation/engine';
import { useSettingsStore } from '@/store/settings';
import { simClock, simDate } from '@/domain/simulation/clock';
import { VISIBLE_PALETTE, drawBracketBox, drawDashedBox, drawHud, drawRider, drawWater, easeOut, postProcess, roundRect, tag } from '@/features/monitor/canvasKit';

const W = 640;
const H = 360;

export function SlideCameraView({ view }: { view: 'entrance' | 'exit' }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const privacy = useSettingsStore((s) => s.privacySilhouettes);
  const camId = view === 'entrance' ? 'CAM-A' : 'CAM-B';

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
    const { slide, simMs, sessionMs, cameras } = snap;
    const runtime = cameras[camId];
    const palette = VISIBLE_PALETTE;
    const clock = `${simDate(sessionMs)} ${simClock(sessionMs)}.${String(Math.floor((sessionMs % 1000) / 10)).padStart(2, '0')}`;
    ctx.fillStyle = '#0a1419';
    ctx.fillRect(0, 0, W, H);
    // sky / wall
    const g = ctx.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, '#0f2230');
    g.addColorStop(1, '#0a1419');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 160);

    if (view === 'entrance') {
      // deck
      ctx.fillStyle = '#20303a';
      ctx.fillRect(0, 230, W, H - 230);
      ctx.fillStyle = '#2b3f4b';
      ctx.fillRect(0, 226, W, 4);
      // tube mouth (right side)
      ctx.fillStyle = '#0b3a48';
      ctx.beginPath();
      ctx.ellipse(540, 215, 60, 48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#041a22';
      ctx.beginPath();
      ctx.ellipse(540, 215, 48, 38, 0, 0, Math.PI * 2);
      ctx.fill();
      drawWater(ctx, 440, 232, 200, 16, simMs, false);
      // railings
      ctx.strokeStyle = '#4a5f6e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(40, 160);
      ctx.lineTo(430, 160);
      ctx.moveTo(60, 160);
      ctx.lineTo(60, 230);
      ctx.moveTo(200, 160);
      ctx.lineTo(200, 230);
      ctx.moveTo(340, 160);
      ctx.lineTo(340, 230);
      ctx.stroke();
      // queue zone
      drawDashedBox(ctx, 40, 120, 250, 118, 'rgba(34,211,238,0.35)');
      tag(ctx, `QUEUE ZONE · ${slide.queue.length} waiting`, 44, 124, { color: '#67e8f9' });
      slide.queue.slice(0, 5).forEach((id, i) => {
        drawRider(ctx, 90 + i * 42, 236 - (i % 2) * 6, { variant: Number(id.replace(/\D/g, '')) % 4, alpha: 1, palette, silhouette: privacy, scale: 0.62 });
      });
      // entry zone + platform rider
      drawDashedBox(ctx, 380, 110, 200, 130, slide.platformRider ? 'rgba(245,158,11,0.6)' : 'rgba(34,211,238,0.35)');
      tag(ctx, `ENTRY ZONE · ${slide.platformRider ? 'occupied' : 'clear'}`, 384, 114, { color: slide.platformRider ? '#fcd34d' : '#67e8f9' });
      if (slide.platformRider) {
        const variant = Number(slide.platformRider.replace(/\D/g, '')) % 4;
        const pose = drawRider(ctx, 470, 232, { variant, alpha: 1, palette, silhouette: privacy, scale: 0.85, leaning: false });
        drawBracketBox(ctx, 440, 160, 62, 76, slide.entryReview === 'recorded' ? '#4ade80' : '#f59e0b', 1.4);
        tag(ctx, `rider · position: seated-start`, 440, 238, { color: slide.entryReview === 'recorded' ? '#86efac' : '#fcd34d', font: '9px ui-monospace, Menlo, monospace' });
        tag(ctx, `conf 91%`, 440, 251, { color: '#dde3ea', font: '9px ui-monospace, Menlo, monospace' });
        void pose;
      }
      // attendant
      drawRider(ctx, 600, 236, { variant: 2, alpha: 1, palette, silhouette: privacy, scale: 0.72 });
      tag(ctx, 'ATTENDANT', 575, 242, { color: 'rgba(221,227,234,0.8)', font: '9px ui-monospace, Menlo, monospace' });
      const review = slide.entryReview === 'recorded' ? 'ENTRY REVIEW: recorded' : slide.entryReview === 'pending' ? 'ENTRY REVIEW: pending' : 'ENTRY REVIEW: —';
      tag(ctx, review, 384, 270, { color: slide.entryReview === 'recorded' ? '#86efac' : slide.entryReview === 'pending' ? '#fcd34d' : 'rgba(221,227,234,0.6)', bg: 'rgba(0,0,0,0.6)' });
      tag(ctx, `in flume: ${slide.inFlume.length}`, 384, 285, { color: 'rgba(221,227,234,0.7)' });
    } else {
      // exit run-out: tube exits top-left, lane runs to the right into the splash zone
      ctx.fillStyle = '#17262f';
      ctx.fillRect(0, 250, W, H - 250);
      ctx.fillStyle = '#0b3a48';
      ctx.beginPath();
      ctx.ellipse(90, 150, 54, 44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#041a22';
      ctx.beginPath();
      ctx.ellipse(90, 150, 42, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      // lane
      ctx.fillStyle = '#0e3a4a';
      roundRect(ctx, 40, 176, 560, 76, 10);
      ctx.fill();
      drawWater(ctx, 44, 180, 552, 68, simMs, false);
      // lane edges
      ctx.strokeStyle = '#2b4b5a';
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 176, 560, 76);
      // splash zone box
      const occupied = Boolean(slide.exitZone.riderId);
      const sinceMs = occupied && slide.exitZone.sinceMs !== undefined ? simMs - slide.exitZone.sinceMs : 0;
      const color = slide.exitZone.prolonged ? '#ef4444' : occupied ? '#f59e0b' : 'rgba(34,211,238,0.35)';
      drawDashedBox(ctx, 330, 150, 290, 120, color);
      tag(ctx, `EXIT / SPLASH ZONE · ${occupied ? 'occupied' : 'clear'}`, 334, 154, { color: slide.exitZone.prolonged ? '#fca5a5' : occupied ? '#fcd34d' : '#67e8f9' });
      if (occupied) {
        const p = easeOut(sinceMs / 1600);
        const x = 140 + p * 340;
        const pose = drawRider(ctx, x, 236, { variant: 1, alpha: 1, palette, silhouette: privacy, scale: 0.8, leaning: true });
        void pose;
        drawBracketBox(ctx, x - 30, 170, 60, 70, color, slide.exitZone.prolonged ? 2 : 1.3);
        tag(ctx, `rider · exit zone ${(sinceMs / 1000).toFixed(1)}s`, x - 30, 242, { color: slide.exitZone.prolonged ? '#fca5a5' : '#fcd34d', font: '9px ui-monospace, Menlo, monospace' });
        if (slide.exitZone.prolonged) tag(ctx, 'PROLONGED OCCUPANCY · HUMAN REVIEW REQUIRED', 334, 256, { color: '#fca5a5', bg: 'rgba(60,10,10,0.9)' });
      }
      // riders in flume indicator
      slide.inFlume.forEach((r, i) => {
        tag(ctx, `${r.label} in flume · ${Math.round(r.progress * 100)}%`, 44, 290 + i * 14, { color: 'rgba(221,227,234,0.75)', font: '9px ui-monospace, Menlo, monospace' });
      });
      if (slide.inFlume.length === 0) tag(ctx, 'flume clear', 44, 290, { color: 'rgba(221,227,234,0.5)', font: '9px ui-monospace, Menlo, monospace' });
      tag(ctx, `exits recorded: ${slide.exits.length}`, 44, 318, { color: 'rgba(221,227,234,0.7)', font: '9px ui-monospace, Menlo, monospace' });
    }

    postProcess(ctx, W, H, { noise: runtime?.noise ?? 0.05, ir: false, t: simMs, degraded: Boolean(runtime?.degraded) });
    drawHud(ctx, W, H, { cameraId: camId, label: view === 'entrance' ? 'Slide entrance' : 'Slide exit', clock, latencyMs: runtime?.latencyMs ?? 42, mode: 'visible · outdoor', privacy: privacy ? 'PRIVACY: silhouettes' : 'PRIVACY: off', offline: false, palette });
    };
    return subscribeFrame(draw);
  }, [privacy, view, camId]);

  return (
    <div className="relative rounded border border-graphite-700 bg-black overflow-hidden">
      <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: `${W}/${H}`, display: 'block' }} role="img" aria-label={`${camId} simulated ${view} camera view`} />
    </div>
  );
}
