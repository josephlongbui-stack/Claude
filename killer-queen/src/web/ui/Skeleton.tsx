import './skeleton.css';

/** Loading placeholders shaped like the content they replace. */
export function Skeleton({ shape, rows = 4 }: { shape: 'table' | 'text' | 'market' | 'summary'; rows?: number }) {
  if (shape === 'table')
    return (
      <div class="skeleton" role="status" aria-label="Loading">
        <div class="sk sk-th" />
        {Array.from({ length: rows }, () => (
          <div class="sk-row">
            <div class="sk sk-w40" />
            <div class="sk sk-w15" />
            <div class="sk sk-w10" />
            <div class="sk sk-w10" />
          </div>
        ))}
      </div>
    );
  if (shape === 'market')
    return (
      <div class="skeleton" role="status" aria-label="Loading">
        <div class="sk sk-xl" />
        <div class="sk sk-w60" />
        <div class="sk sk-chart" />
        {Array.from({ length: 5 }, () => (
          <div class="sk-row">
            <div class="sk sk-w30" />
            <div class="sk sk-w10" />
            <div class="sk sk-w30" />
          </div>
        ))}
      </div>
    );
  if (shape === 'summary')
    return (
      <div class="skeleton sk-inline" role="status" aria-label="Loading">
        {Array.from({ length: 4 }, () => (
          <div class="sk-stat">
            <div class="sk sk-w60" />
            <div class="sk sk-m" />
          </div>
        ))}
      </div>
    );
  return (
    <div class="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div class={`sk ${i === rows - 1 ? 'sk-w60' : ''}`} />
      ))}
    </div>
  );
}
