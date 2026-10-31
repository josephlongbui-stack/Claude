import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { StatusPill, type Status } from './StatusPill.js';
import { Panel, PanelBody, PanelHead } from './Panel.js';
import './packet.css';

export interface Packet {
  marketId?: string;
  title: string;
  prompt: string;
  repo: string;
  commit: string;
  testCommand: string;
  baseline: string;
  closesAt: number;
  executor: { id: string; name: string; org: string; version: string; chosen: number; passed: number };
}

export const when = (ms: number | null | undefined): string => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function baselineWords(b: string): string {
  const m = /failing (\d+)\/(\d+)/.exec(b);
  if (m) return `Failing ${m[1]} of ${m[2]} before any agent`;
  if (b === 'pending') return 'Running now';
  if (b === 'not run') return 'Not required for this task';
  return b;
}

/** The packet: what every trader and the runner see. */
export function PacketView({ packet, status, closedLabel, full }: { packet: Packet; status: Status; closedLabel?: string; full?: boolean }) {
  const [open, setOpen] = useState(!!full);
  const [clipped, setClipped] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [packet.prompt, open]);
  const long = open || clipped;
  return (
    <Panel class="packet" testId="packet">
      <PanelHead title="Packet" aside={<StatusPill status={status} />} />
      <PanelBody>
        <dl class="packet-list">
          <dt>Agent</dt>
          <dd>
            <b>{packet.executor.name}</b> <span class="ink-3">{packet.executor.version}</span>
            <div class="ink-2">{packet.executor.chosen === 0 ? 'No runs yet on this version' : `Passed ${packet.executor.passed} of ${packet.executor.chosen} runs on this version`}</div>
          </dd>
          <dt>Prompt</dt>
          <dd>
            <div class="prompt">
              <pre class={`prompt-text ${open ? '' : 'clamp'}`} ref={ref}>
                {packet.prompt}
              </pre>
            </div>
            {long && !full && (
              <button type="button" class="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
                {open ? 'Show less' : 'Show the whole prompt'}
              </button>
            )}
          </dd>
          <dt>Repository</dt>
          <dd class="mono">{packet.repo}</dd>
          <dt>Commit</dt>
          <dd class="mono">{packet.commit}</dd>
          <dt>Test command</dt>
          <dd class="mono">{packet.testCommand}</dd>
          <dt>Baseline</dt>
          <dd>{baselineWords(packet.baseline)}</dd>
          <dt>{closedLabel ?? 'Trading closes'}</dt>
          <dd>{when(packet.closesAt)}</dd>
        </dl>
      </PanelBody>
    </Panel>
  );
}
