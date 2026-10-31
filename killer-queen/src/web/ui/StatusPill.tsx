import './pill.css';

export type Status = 'open' | 'soon' | 'closed' | 'running' | 'passed' | 'failed' | 'settled' | 'skipped' | 'pending' | 'rejected' | 'cancelled' | 'infra_error' | 'resolved' | 'private' | 'demo';

const WORDS: Record<Status, string> = {
  open: 'Open',
  soon: 'Closing soon',
  closed: 'Closed',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  settled: 'Settled at close',
  skipped: 'Skipped',
  pending: 'Baseline check',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  infra_error: 'No result',
  resolved: 'Resolved',
  private: 'Private',
  demo: 'Demo data',
};

/** A status word, never colour alone. */
export function StatusPill({ status, children, title, class: cls }: { status: Status; children?: string; title?: string; class?: string }) {
  const dot = status === 'open' || status === 'soon' || status === 'running';
  return (
    <span class={`pill ${status} ${cls ?? ''}`} title={title} data-testid={`status-${status}`}>
      {dot && <span class="dot" aria-hidden="true" />}
      {children ?? WORDS[status]}
    </span>
  );
}

/** Task status → pill status (closing soon when under a minute). */
export function taskStatus(t: { status: string; closesAt?: number; passed?: boolean | null; outcome?: string | null }, now = Date.now()): Status {
  if (t.status === 'open') return t.closesAt !== undefined && t.closesAt - now < 60_000 ? 'soon' : 'open';
  if (t.status === 'resolved') return t.outcome === 'infra_error' ? 'infra_error' : t.passed ? 'passed' : 'failed';
  return (['closed', 'running', 'skipped', 'pending', 'rejected'].includes(t.status) ? t.status : 'closed') as Status;
}

/** Market status → pill status. */
export function marketStatus(m: { status: string; outcome?: string | null }): Status {
  if (m.status === 'settled') {
    if (m.outcome === 'passed' || m.outcome === 'failed') return m.outcome;
    if (m.outcome === 'infra_error') return 'infra_error';
    return 'settled';
  }
  return (['open', 'closed', 'running', 'pending', 'cancelled'].includes(m.status) ? m.status : 'closed') as Status;
}
