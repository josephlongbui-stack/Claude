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

interface DownloadsNamespace {
  save(request: { filename: string; data: string }): Promise<{ status: string }>;
}

interface ClaudeHost {
  use?: (name: 'downloads') => Promise<DownloadsNamespace | null>;
}

export type DownloadOutcome = 'saved' | 'declined' | 'unavailable' | 'browser';

/**
 * Offers a generated text file to the viewer. Inside the claude.ai artifact viewer, plain
 * downloads are blocked, so the viewer's `downloads` capability is used (it asks the viewer to
 * confirm). Everywhere else (local dev, GitHub Pages) it falls back to a normal browser download.
 */
export async function downloadText(filename: string, text: string, mime = 'text/plain'): Promise<DownloadOutcome> {
  if (typeof document === 'undefined') return 'unavailable';
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    const downloads = await host.use('downloads').catch(() => null);
    if (downloads) {
      try {
        await downloads.save({ filename, data: text });
        return 'saved';
      } catch (err) {
        const code = (err as { code?: string })?.code;
        return code === 'declined' || code === 'rate_limited' ? 'declined' : 'unavailable';
      }
    }
    return 'unavailable';
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'browser';
}
