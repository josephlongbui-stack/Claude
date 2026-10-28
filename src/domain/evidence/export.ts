import type { EventRecord } from '../types';

export function eventsToJson(records: EventRecord[], meta: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      generatedBy: 'RideOps AI — simulation demo',
      disclaimer: 'SIMULATION — synthetic records only. Not certified for ride safety or dispatch control. No real recordings or incidents are represented.',
      generatedAt: new Date().toISOString(),
      ...meta,
      count: records.length,
      records,
    },
    null,
    2,
  );
}

const CSV_COLUMNS: (keyof EventRecord | 'target' | 'sensor')[] = [
  'seq', 'id', 'ts', 'rideId', 'cameraId', 'target', 'type', 'severity', 'title', 'detail', 'confidence', 'sensor', 'reviewStatus', 'notes', 'evidenceRef', 'scenarioId', 'prevHash', 'hash',
];

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function eventsToCsv(records: EventRecord[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = records.map((r) =>
    CSV_COLUMNS.map((col) => {
      if (col === 'target') return csvEscape(r.target ? (r.target.kind === 'seat' ? r.target.seatId : r.target.kind === 'zone' ? r.target.zone : r.target.equipmentId) : '');
      if (col === 'sensor') return csvEscape(r.sensor ? `${r.sensor.sensorId}:${r.sensor.reading}` : '');
      return csvEscape(r[col]);
    }).join(','),
  );
  return ['# SIMULATION — synthetic records only. Not certified for ride safety or dispatch control.', header, ...rows].join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
