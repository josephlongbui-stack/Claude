import { useMemo } from 'react';
import type { EvaluatedSeat, RideConfiguration, SeatId, SeatState } from '@/domain/types';
import { allSeats, parseSeatId, seatLabel } from '@/domain/rides/seats';
import { SEAT_STATE_COLOR } from '@/components/ui';
import { SEAT_STATE_LABEL } from '@/domain/observation/evaluator';

interface SeatPos {
  id: SeatId;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

export function layoutSeatMap(ride: RideConfiguration): { seats: SeatPos[]; width: number; height: number; decor: React.ReactNode } {
  const g = ride.geometry;
  const ids = allSeats(g);
  const seats: SeatPos[] = [];
  if (g.kind === 'radial') {
    const n = g.seatsPerRow;
    const R = 92;
    const cx = 130;
    const cy = 130;
    ids.forEach((id, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      seats.push({ id, x: cx + Math.cos(a) * R - 13, y: cy + Math.sin(a) * R - 11, w: 26, h: 22, rot: (a * 180) / Math.PI + 90 });
    });
    const decor = (
      <>
        <circle cx={cx} cy={cy} r={62} fill="none" stroke="#2c3645" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={6} fill="#2c3645" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fill="#8794a5">
          TOWER
        </text>
      </>
    );
    return { seats, width: 260, height: 260, decor };
  }
  if (g.kind === 'gondolas') {
    const n = g.rows;
    const cx = 150;
    const cy = 140;
    const R = 92;
    ids.forEach((id) => {
      const { row, seat } = parseSeatId(id);
      const a = ((row - 1) / n) * Math.PI * 2 - Math.PI / 2;
      const gx = cx + Math.cos(a) * R;
      const gy = cy + Math.sin(a) * R;
      const col = (seat - 1) % 2;
      const r = Math.floor((seat - 1) / 2);
      seats.push({ id, x: gx - 22 + col * 23, y: gy - 20 + r * 21, w: 21, h: 19 });
    });
    const decor = (
      <>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * (R - 30)} y2={cy + Math.sin(a) * (R - 30)} stroke="#2c3645" strokeWidth={3} />;
        })}
        <circle cx={cx} cy={cy} r={12} fill="#2c3645" />
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          return (
            <text key={`t${i}`} x={cx + Math.cos(a) * (R + 38)} y={cy + Math.sin(a) * (R + 38) + 3} textAnchor="middle" fontSize={8.5} fill="#8794a5">
              G{i + 1}
            </text>
          );
        })}
      </>
    );
    return { seats, width: 300, height: 290, decor };
  }
  // train / vehicles / boats: rows stacked, optional mirrored gap
  const seatW = 34;
  const seatH = 26;
  const gapX = 6;
  const rowGap = g.rowsPerUnit ? 10 : 8;
  const mirrorGap = g.mirrored ? 26 : 0;
  const rowW = g.seatsPerRow * seatW + (g.seatsPerRow - 1) * gapX + mirrorGap;
  const x0 = 30;
  const y0 = 24;
  ids.forEach((id) => {
    const { row, seat } = parseSeatId(id);
    const unitExtra = g.rowsPerUnit ? Math.floor((row - 1) / g.rowsPerUnit) * 14 : 0;
    const mirrorShift = g.mirrored && seat > g.seatsPerRow / 2 ? mirrorGap : 0;
    seats.push({ id, x: x0 + (seat - 1) * (seatW + gapX) + mirrorShift, y: y0 + (row - 1) * (seatH + rowGap) + unitExtra, w: seatW, h: seatH });
  });
  const totalH = y0 + g.rows * (seatH + rowGap) + (g.rowsPerUnit ? Math.ceil(g.rows / g.rowsPerUnit) * 14 : 0) + 10;
  const decor = (
    <>
      {g.mirrored && <rect x={x0 + (g.seatsPerRow / 2) * (seatW + gapX) - gapX + 4} y={y0 - 10} width={mirrorGap - 8} height={totalH - y0 - 4} fill="#1a212d" stroke="#2c3645" rx={3} />}
      {g.rowsPerUnit
        ? Array.from({ length: Math.ceil(g.rows / g.rowsPerUnit) }, (_, u) => (
            <g key={u}>
              <rect x={x0 - 10} y={y0 - 8 + u * (g.rowsPerUnit! * (seatH + rowGap) + 14)} width={rowW + 20} height={g.rowsPerUnit! * (seatH + rowGap) + 4} rx={6} fill="none" stroke="#2c3645" />
              <text x={x0 - 14} y={y0 + 4 + u * (g.rowsPerUnit! * (seatH + rowGap) + 14)} fontSize={8} fill="#8794a5" textAnchor="end">
                {g.unitLabel?.charAt(0)}{u + 1}
              </text>
            </g>
          ))
        : Array.from({ length: g.rows }, (_, r) => <rect key={r} x={x0 - 8} y={y0 - 5 + r * (seatH + rowGap)} width={rowW + 16} height={seatH + 10} rx={5} fill="none" stroke="#2c3645" />)}
      {Array.from({ length: g.rows }, (_, r) => (
        <text key={`l${r}`} x={x0 + rowW + 14} y={y0 + r * (seatH + rowGap) + (g.rowsPerUnit ? Math.floor(r / g.rowsPerUnit) * 14 : 0) + seatH / 2 + 3} fontSize={8.5} fill="#8794a5">
          {g.rowLabel.charAt(0)}{r + 1}
        </text>
      ))}
      <text x={x0 + rowW / 2} y={12} textAnchor="middle" fontSize={8.5} fill="#8794a5" letterSpacing={1}>
        ▲ {g.facing === 'inward' ? 'FACING INWARD' : 'FRONT OF ' + (g.unitLabel ?? 'TRAIN').toUpperCase()}
      </text>
    </>
  );
  return { seats, width: x0 + rowW + 40, height: totalH, decor };
}

export function SeatMap({ ride, seats, selectedSeatId, onSelect, compact = false }: { ride: RideConfiguration; seats: Record<SeatId, EvaluatedSeat>; selectedSeatId: SeatId | null; onSelect: (id: SeatId) => void; compact?: boolean }) {
  const layout = useMemo(() => layoutSeatMap(ride), [ride]);
  const counts = useMemo(() => {
    const c: Record<SeatState, number> = { empty: 0, nominal: 0, review: 0, concern: 0, unknown: 0 };
    for (const s of Object.values(seats)) c[s.state] += 1;
    return c;
  }, [seats]);

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex-1 min-h-0 flex items-start justify-center">
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="max-h-full w-full" style={{ maxHeight: compact ? 220 : 420 }} role="group" aria-label={`${ride.name} seat map`}>
          {layout.decor}
          {layout.seats.map((p) => {
            const ev = seats[p.id];
            const state = ev?.state ?? 'unknown';
            const fill = SEAT_STATE_COLOR[state];
            const selected = selectedSeatId === p.id;
            const { seat } = parseSeatId(p.id);
            return (
              <g key={p.id} transform={p.rot ? `rotate(${p.rot} ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }} role="button" aria-label={`${seatLabel(ride, p.id)} — ${SEAT_STATE_LABEL[state]}`}>
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={4} fill={fill} fillOpacity={state === 'empty' ? 0.35 : 0.85} stroke={selected ? '#22d3ee' : state === 'concern' ? '#fca5a5' : '#0b0f16'} strokeWidth={selected ? 2 : 1} className={state === 'concern' ? 'pulse-red' : ''} />
                {state === 'concern' && <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={4} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.6} />}
                <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 3} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, Menlo, monospace" fill={state === 'empty' ? '#8794a5' : '#07090d'} fontWeight={600}>
                  {ride.geometry.kind === 'radial' ? seat : `S${seat}`}
                </text>
                {state === 'unknown' && <text x={p.x + p.w - 6} y={p.y + 8} fontSize={8} fill="#07090d" fontWeight={700}>?</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-graphite-300 shrink-0">
        {(['empty', 'nominal', 'review', 'concern', 'unknown'] as SeatState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SEAT_STATE_COLOR[s], opacity: s === 'empty' ? 0.5 : 1 }} />
            {SEAT_STATE_LABEL[s]} <span className="mono text-graphite-100">{counts[s]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
