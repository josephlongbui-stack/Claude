import type { RestraintType } from '@/domain/types';

/** Canvas 2D helpers for the simulated camera views. Everything drawn here is schematic. */

export interface Palette {
  bg: string;
  floor: string;
  floorEdge: string;
  rail: string;
  carBody: string;
  carEdge: string;
  seat: string;
  seatBack: string;
  restraint: string;
  riderSkin: string[];
  riderShirt: string[];
  text: string;
  hud: string;
  ir: boolean;
}

export const VISIBLE_PALETTE: Palette = {
  bg: '#0b1016',
  floor: '#1b222d',
  floorEdge: '#2b3545',
  rail: '#55637a',
  carBody: '#263040',
  carEdge: '#3a4759',
  seat: '#1a2230',
  seatBack: '#2a3443',
  restraint: '#9aa7b8',
  riderSkin: ['#9d8a7a', '#8a7a6e', '#a89483', '#7c6d61'],
  riderShirt: ['#3f6f8e', '#8e5a3f', '#4f7a55', '#6b5b95'],
  text: '#dde3ea',
  hud: 'rgba(221,227,234,0.9)',
  ir: false,
};

export const IR_PALETTE: Palette = {
  bg: '#061009',
  floor: '#0d1f12',
  floorEdge: '#17301d',
  rail: '#2f5a3a',
  carBody: '#12281a',
  carEdge: '#1f3f28',
  seat: '#0c1a10',
  seatBack: '#163322',
  restraint: '#6fae84',
  riderSkin: ['#bfe8c8', '#b2dcbb', '#c8f0d0', '#a9d3b2'],
  riderShirt: ['#6fae84', '#64a078', '#79b98e', '#5c9470'],
  text: '#c9f2d3',
  hud: 'rgba(201,242,211,0.9)',
  ir: true,
};

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: { color?: string; bg?: string; font?: string; align?: 'left' | 'right'; pad?: number } = {}): { w: number; h: number } {
  const font = opts.font ?? '10px ui-monospace, Menlo, monospace';
  const pad = opts.pad ?? 3;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const w = metrics.width + pad * 2;
  const h = 13;
  const left = opts.align === 'right' ? x - w : x;
  ctx.fillStyle = opts.bg ?? 'rgba(7,9,13,0.78)';
  roundRect(ctx, left, y, w, h, 2);
  ctx.fill();
  ctx.fillStyle = opts.color ?? '#dde3ea';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, left + pad, y + h / 2 + 0.5);
  return { w, h };
}

export function drawBracketBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, lineWidth = 1.2): void {
  const c = Math.min(10, w / 4, h / 4);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  // corners
  ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
  ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
  ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
  ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
  ctx.stroke();
}

export function drawDashedBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();
}

export interface RiderOpts {
  variant: number;
  alpha: number;
  leaning?: boolean;
  phone?: boolean;
  palette: Palette;
  silhouette: boolean;
  /** 1 = nearest-row scale. */
  scale: number;
  facing?: 'camera' | 'away';
}

export interface PosePoints {
  head: [number, number];
  neck: [number, number];
  lShoulder: [number, number];
  rShoulder: [number, number];
  lHand: [number, number];
  rHand: [number, number];
  hip: [number, number];
}

/** Draws a seated upper-body silhouette; returns pose keypoints for the overlay. */
export function drawRider(ctx: CanvasRenderingContext2D, cx: number, baseY: number, opts: RiderOpts): PosePoints {
  const s = opts.scale;
  const lean = opts.leaning ? 10 * s : 0;
  const headR = 9 * s;
  const shoulderW = 26 * s;
  const torsoH = 34 * s;
  const skin = opts.silhouette ? opts.palette.riderSkin[opts.variant % 4] : opts.palette.riderSkin[opts.variant % 4];
  const shirt = opts.palette.riderShirt[opts.variant % 4];
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  // torso
  ctx.fillStyle = shirt;
  roundRect(ctx, cx - shoulderW / 2 + lean * 0.4, baseY - torsoH, shoulderW, torsoH, 6 * s);
  ctx.fill();
  // arms
  ctx.strokeStyle = shirt;
  ctx.lineWidth = 6 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW / 2 + 3 * s + lean * 0.4, baseY - torsoH + 6 * s);
  ctx.lineTo(cx - shoulderW / 2 - 4 * s + lean * 0.2, baseY - 8 * s);
  ctx.moveTo(cx + shoulderW / 2 - 3 * s + lean * 0.4, baseY - torsoH + 6 * s);
  if (opts.phone) ctx.lineTo(cx + shoulderW / 2 + 6 * s, baseY - torsoH - 2 * s);
  else ctx.lineTo(cx + shoulderW / 2 + 4 * s + lean * 0.2, baseY - 8 * s);
  ctx.stroke();
  // hands
  ctx.fillStyle = skin;
  const lHand: [number, number] = [cx - shoulderW / 2 - 4 * s + lean * 0.2, baseY - 8 * s];
  const rHand: [number, number] = opts.phone ? [cx + shoulderW / 2 + 6 * s, baseY - torsoH - 2 * s] : [cx + shoulderW / 2 + 4 * s + lean * 0.2, baseY - 8 * s];
  ctx.beginPath();
  ctx.arc(lHand[0], lHand[1], 3.4 * s, 0, Math.PI * 2);
  ctx.arc(rHand[0], rHand[1], 3.4 * s, 0, Math.PI * 2);
  ctx.fill();
  if (opts.phone) {
    ctx.fillStyle = opts.palette.ir ? '#eafff0' : '#111827';
    ctx.strokeStyle = opts.palette.ir ? '#eafff0' : '#67e8f9';
    ctx.lineWidth = 1;
    roundRect(ctx, rHand[0] - 3 * s, rHand[1] - 7 * s, 6 * s, 10 * s, 1.5);
    ctx.fill();
    ctx.stroke();
  }
  // neck + head
  const headC: [number, number] = [cx + lean, baseY - torsoH - headR - 2 * s];
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 4 * s + lean * 0.8, baseY - torsoH - 4 * s, 8 * s, 6 * s);
  ctx.beginPath();
  ctx.arc(headC[0], headC[1], headR, 0, Math.PI * 2);
  ctx.fill();
  if (opts.palette.ir) {
    // thermal highlight
    ctx.fillStyle = 'rgba(234,255,240,0.35)';
    ctx.beginPath();
    ctx.arc(headC[0], headC[1], headR * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return {
    head: headC,
    neck: [cx + lean * 0.8, baseY - torsoH],
    lShoulder: [cx - shoulderW / 2 + 3 * s + lean * 0.4, baseY - torsoH + 6 * s],
    rShoulder: [cx + shoulderW / 2 - 3 * s + lean * 0.4, baseY - torsoH + 6 * s],
    lHand,
    rHand,
    hip: [cx, baseY],
  };
}

export function drawPose(ctx: CanvasRenderingContext2D, p: PosePoints, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.9;
  const line = (a: [number, number], b: [number, number]): void => {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  };
  line(p.head, p.neck);
  line(p.neck, p.lShoulder);
  line(p.neck, p.rShoulder);
  line(p.lShoulder, p.lHand);
  line(p.rShoulder, p.rHand);
  line(p.neck, p.hip);
  for (const pt of [p.head, p.neck, p.lShoulder, p.rShoulder, p.lHand, p.rHand, p.hip]) {
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface SeatDrawOpts {
  palette: Palette;
  scale: number;
  restraint: RestraintType;
  restraintState: 'nominal' | 'review' | 'concern' | 'unknown' | 'not_applicable';
  occupied: boolean;
}

/** Draws seat back + base. Returns the lap line y for rider placement. */
export function drawSeat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: SeatDrawOpts): void {
  const p = o.palette;
  ctx.fillStyle = p.seatBack;
  roundRect(ctx, x, y, w, h * 0.72, 4 * o.scale);
  ctx.fill();
  ctx.fillStyle = p.seat;
  roundRect(ctx, x - 2 * o.scale, y + h * 0.62, w + 4 * o.scale, h * 0.38, 4 * o.scale);
  ctx.fill();
  ctx.strokeStyle = p.carEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawRestraint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: SeatDrawOpts): void {
  const p = o.palette;
  const s = o.scale;
  const lapY = y + h * 0.66;
  const concern = o.restraintState === 'concern';
  const notApplicable = o.restraintState === 'not_applicable';
  ctx.save();
  ctx.strokeStyle = concern ? '#ef4444' : p.restraint;
  ctx.lineWidth = 4 * s;
  ctx.lineCap = 'round';
  if (o.restraint === 'ots_harness') {
    // two shoulder straps meeting at the lap
    const raise = notApplicable ? -22 * s : concern ? -9 * s : 0;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + 2 * s + raise);
    ctx.lineTo(x + w * 0.42, lapY + raise);
    ctx.moveTo(x + w * 0.7, y + 2 * s + raise);
    ctx.lineTo(x + w * 0.58, lapY + raise);
    ctx.stroke();
    if (!notApplicable) {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, lapY + raise);
      ctx.lineTo(x + w * 0.7, lapY + raise);
      ctx.stroke();
    }
  } else {
    // lap bar: horizontal; raised when not applicable; angled gap when concern
    const raise = notApplicable ? -26 * s : 0;
    ctx.beginPath();
    ctx.moveTo(x + 2 * s, lapY + raise);
    ctx.lineTo(x + w - 2 * s, lapY + raise + (concern ? -7 * s : 0));
    ctx.stroke();
    if (o.restraint === 'lap_belt') {
      ctx.strokeStyle = concern ? '#ef4444' : '#b98f4e';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, lapY + raise + 4 * s);
      ctx.lineTo(x + w * 0.8, lapY + raise + 4 * s);
      ctx.stroke();
    }
  }
  ctx.restore();
}

let noiseCanvas: HTMLCanvasElement | null = null;
function getNoise(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (noiseCanvas) return noiseCanvas;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(160, 160);
  let seed = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed % 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

export function postProcess(ctx: CanvasRenderingContext2D, w: number, h: number, opts: { noise: number; ir: boolean; t: number; degraded: boolean }): void {
  const n = getNoise();
  if (n && opts.noise > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, opts.noise);
    ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor((opts.t / 50) % 160);
    const oy = Math.floor((opts.t / 70) % 160);
    for (let x = -ox; x < w; x += 160) for (let y = -oy; y < h; y += 160) ctx.drawImage(n, x, y);
    ctx.restore();
  }
  // scanlines
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.restore();
  // vignette
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, opts.ir ? 'rgba(0,10,4,0.55)' : 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (opts.degraded) {
    ctx.fillStyle = 'rgba(120,120,120,0.18)';
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, hud: { cameraId: string; label: string; clock: string; latencyMs: number; mode: string; privacy: string; offline: boolean; palette: Palette; extra?: string }): void {
  const color = hud.palette.hud;
  ctx.save();
  // corner brackets
  drawBracketBox(ctx, 6, 6, w - 12, h - 12, 'rgba(221,227,234,0.25)', 1);
  tag(ctx, `${hud.cameraId} · ${hud.label}`, 10, 10, { color, font: 'bold 10.5px ui-monospace, Menlo, monospace' });
  tag(ctx, hud.clock, w - 10, 10, { color, align: 'right' });
  // rec dot
  ctx.fillStyle = hud.offline ? '#64748b' : '#ef4444';
  ctx.beginPath();
  ctx.arc(w - 18, 32, 3, 0, Math.PI * 2);
  ctx.fill();
  tag(ctx, hud.offline ? 'OFFLINE (SIM)' : 'LIVE · SIM', w - 24, 26, { color, align: 'right' });
  tag(ctx, `${hud.mode} · ${hud.latencyMs} ms · 12 fps`, 10, h - 23, { color });
  tag(ctx, hud.privacy, w - 10, h - 23, { color, align: 'right' });
  if (hud.extra) tag(ctx, hud.extra, 10, 26, { color: '#fcd34d' });
  ctx.restore();
}

export function drawOcclusion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string): void {
  ctx.save();
  ctx.fillStyle = 'rgba(15,10,30,0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(167,139,250,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -h; i < w; i += 9) {
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#a78bfa';
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.setLineDash([]);
  tag(ctx, `OCCLUSION · ${label}`, x + 4, y + 4, { color: '#c4b5fd', bg: 'rgba(30,20,60,0.9)' });
  ctx.restore();
}

export function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

export function easeIn(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c;
}

export function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, ir: boolean): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, ir ? '#0e2a1c' : '#0e3a4a');
  g.addColorStop(1, ir ? '#07140d' : '#06222c');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.strokeStyle = ir ? 'rgba(160,230,180,0.18)' : 'rgba(103,232,249,0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    const yy = y + 8 + (i / 6) * (h - 16);
    ctx.beginPath();
    for (let xx = x; xx <= x + w; xx += 6) {
      const amp = 2 + i * 0.4;
      const yy2 = yy + Math.sin((xx + t / 12 + i * 40) / 14) * amp;
      if (xx === x) ctx.moveTo(xx, yy2);
      else ctx.lineTo(xx, yy2);
    }
    ctx.stroke();
  }
  ctx.restore();
}
