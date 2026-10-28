import { useSimulationStore } from '@/store/simulation';

/** Side-profile schematic of the slide with riders positioned by progress. */
export function SlideDiagram() {
  const slide = useSimulationStore((s) => s.slide);
  const pathD = 'M 60 40 C 140 40, 170 90, 220 130 S 300 190, 380 200 S 470 225, 520 232';
  // approximate points along the curve for rider placement
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i += 1) pts.push(cubicPoint(i / 40));
  const at = (p: number): [number, number] => pts[Math.round(Math.min(1, Math.max(0, p)) * 40)];
  const occupiedExit = Boolean(slide.exitZone.riderId);
  return (
    <svg viewBox="0 0 600 270" className="w-full mx-auto" style={{ maxHeight: 300 }} role="img" aria-label="Water slide schematic">
      <defs>
        <linearGradient id="flume" x1="0" x2="1">
          <stop offset="0" stopColor="#0e7490" />
          <stop offset="1" stopColor="#164e63" />
        </linearGradient>
      </defs>
      {/* tower */}
      <rect x="20" y="40" width="50" height="200" fill="#1a212d" stroke="#2c3645" />
      <text x="45" y="255" fontSize="9" fill="#8794a5" textAnchor="middle">TOWER</text>
      {/* platform */}
      <rect x="20" y="36" width="60" height="6" fill="#3d4959" />
      <text x="20" y="14" fontSize="9" fill="#b4bfcc">START PLATFORM</text>
      {/* flume */}
      <path d={pathD} stroke="url(#flume)" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={pathD} stroke="#22d3ee" strokeWidth="1" fill="none" strokeOpacity="0.4" strokeDasharray="4 4" />
      {/* run-out */}
      <rect x="500" y="226" width="90" height="22" rx="6" fill={occupiedExit ? (slide.exitZone.prolonged ? '#7f1d1d' : '#92400e') : '#164e63'} stroke={occupiedExit ? (slide.exitZone.prolonged ? '#ef4444' : '#f59e0b') : '#0e7490'} />
      <text x="592" y="262" fontSize="9" fill={occupiedExit ? (slide.exitZone.prolonged ? '#fca5a5' : '#fcd34d') : '#8794a5'} textAnchor="end">
        EXIT ZONE · {occupiedExit ? (slide.exitZone.prolonged ? 'REVIEW REQUIRED' : 'occupied') : 'clear'}
      </text>
      {/* queue */}
      {slide.queue.slice(0, 6).map((id, i) => (
        <circle key={id} cx={12 + 0} cy={60 + i * 14} r={4} fill="#8794a5" />
      ))}
      <text x="12" y="52" fontSize="8" fill="#8794a5" textAnchor="middle">Q{slide.queue.length}</text>
      {/* platform rider */}
      {slide.platformRider && (
        <g>
          <circle cx="66" cy="30" r="6" fill={slide.entryReview === 'recorded' ? '#4ade80' : '#f59e0b'} />
          <text x="78" y="27" fontSize="8" fill="#dde3ea">{slide.entryReview === 'recorded' ? 'start checked' : slide.entryReview === 'pending' ? 'checking start position' : 'at the top'}</text>
        </g>
      )}
      {/* in-flume riders */}
      {slide.inFlume.map((r) => {
        const [x, y] = at(r.progress);
        return (
          <g key={r.id}>
            <circle cx={x} cy={y} r={6} fill="#22d3ee" stroke="#07090d" />
            <text x={x} y={y - 10} fontSize="8" fill="#67e8f9" textAnchor="middle">{r.label} · {Math.round(r.progress * 100)}%</text>
          </g>
        );
      })}
      {occupiedExit && <circle cx="545" cy="237" r={6} fill={slide.exitZone.prolonged ? '#ef4444' : '#f59e0b'} stroke="#07090d" />}
      <text x="592" y="14" fontSize="8.5" fill="#5b6878" textAnchor="end">Schematic only. There is no clearance or release signal in this demo.</text>
    </svg>
  );
}

function cubicPoint(t: number): [number, number] {
  // piecewise approximation of the path used above
  const segs: [number, number][][] = [
    [[60, 40], [140, 40], [170, 90], [220, 130]],
    [[220, 130], [270, 170], [300, 190], [380, 200]],
    [[380, 200], [460, 210], [470, 225], [520, 232]],
  ];
  const s = Math.min(2, Math.floor(t * 3));
  const u = t * 3 - s;
  const [p0, p1, p2, p3] = segs[s];
  const x = (1 - u) ** 3 * p0[0] + 3 * (1 - u) ** 2 * u * p1[0] + 3 * (1 - u) * u ** 2 * p2[0] + u ** 3 * p3[0];
  const y = (1 - u) ** 3 * p0[1] + 3 * (1 - u) ** 2 * u * p1[1] + 3 * (1 - u) * u ** 2 * p2[1] + u ** 3 * p3[1];
  return [x, y];
}
