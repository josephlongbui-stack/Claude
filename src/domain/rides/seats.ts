import type { RideConfiguration, RideGeometry, SeatId } from '../types';

export const seatId = (row: number, seat: number): SeatId => `R${row}S${seat}`;

export function parseSeatId(id: SeatId): { row: number; seat: number } {
  const m = /^R(\d+)S(\d+)$/.exec(id);
  if (!m) return { row: 0, seat: 0 };
  return { row: Number(m[1]), seat: Number(m[2]) };
}

export function allSeats(geometry: RideGeometry): SeatId[] {
  const ids: SeatId[] = [];
  for (let r = 1; r <= geometry.rows; r += 1) {
    for (let s = 1; s <= geometry.seatsPerRow; s += 1) ids.push(seatId(r, s));
  }
  return ids;
}

export function seatsInRows(geometry: RideGeometry, rows: number[]): SeatId[] {
  const ids: SeatId[] = [];
  for (const r of rows) for (let s = 1; s <= geometry.seatsPerRow; s += 1) ids.push(seatId(r, s));
  return ids;
}

/** Human label for a seat, honouring the ride's geometry vocabulary. */
export function seatLabel(ride: RideConfiguration, id: SeatId): string {
  const { row, seat } = parseSeatId(id);
  const g = ride.geometry;
  if (g.kind === 'radial') return `Seat ${seat}`;
  if (g.rowsPerUnit && g.unitLabel) {
    const unit = Math.ceil(row / g.rowsPerUnit);
    const rowInUnit = ((row - 1) % g.rowsPerUnit) + 1;
    return `${g.unitLabel} ${unit} · ${g.rowLabel} ${rowInUnit} · Seat ${seat}`;
  }
  return `${g.rowLabel} ${row} · Seat ${seat}`;
}

export function shortSeatLabel(ride: RideConfiguration, id: SeatId): string {
  const { row, seat } = parseSeatId(id);
  if (ride.geometry.kind === 'radial') return `S${seat}`;
  return `${ride.geometry.rowLabel.charAt(0)}${row}·S${seat}`;
}

export function totalSeats(ride: RideConfiguration): number {
  return ride.geometry.rows * ride.geometry.seatsPerRow;
}

export function cameraForSeat(ride: RideConfiguration, id: SeatId): string {
  const cam = ride.cameras.find((c) => c.coverage.includes(id));
  return cam?.id ?? ride.cameras[0]?.id ?? 'CAM-01';
}
