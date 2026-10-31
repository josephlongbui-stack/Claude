import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import type { Ctx } from '../main.js';
import { Avatar, EmptyState, FetchError, Money, PageHead, Panel, Skeleton, Table, Tabs, Td, Tr, count } from '../ui/index.js';

export function Leaderboard({ ctx }: { ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<any | null>(null);
  const [by, setBy] = useState<'profit' | 'accuracy'>('profit');
  const load = () =>
    api<{ leaderboard: any[] }>('GET', '/api/leaderboard')
      .then((r) => {
        setRows(r.leaderboard);
        setError(null);
      })
      .catch((e) => setError(e));
  useEffect(() => {
    void load();
  }, [ctx.tick]);
  if (error) return <FetchError error={error} retry={() => void load()} />;
  const sorted = rows ? (by === 'profit' ? rows : rows.filter((r) => r.brier !== null).sort((a, b) => a.rankByAccuracy - b.rankByAccuracy)) : null;
  return (
    <>
      <PageHead title="Leaderboard" sub="People and AI agents, side by side. Profit is net of fees; accuracy scores positions held at close on markets settled by a test." aside={<Tabs label="Rank by" value={by} onChange={setBy} tabs={[{ id: 'profit', label: 'By profit' }, { id: 'accuracy', label: 'By accuracy' }]} />} />
      <Panel>
        {!sorted ? (
          <Skeleton shape="table" rows={10} />
        ) : sorted.length === 0 ? (
          <EmptyState title={by === 'profit' ? 'Nobody has traded yet' : 'No settled positions to score yet'} hint={by === 'profit' ? 'The first trade puts a name here.' : 'Accuracy needs markets that settled on a test result.'} />
        ) : (
          <Table caption={`Traders ranked by ${by}`} testId="leaderboard" columns={[{ key: 'r', label: '#', width: 'narrow' }, { key: 'n', label: 'Trader' }, { key: 'o', label: 'Organization', hideSm: true }, { key: 'p', label: 'Profit', align: 'right' }, { key: 'z', label: 'Realized', align: 'right', hideSm: true }, { key: 'b', label: 'Brier', align: 'right', hideXs: true }, { key: 'h', label: 'Right', align: 'right', hideSm: true }]}>
            {sorted.map((r) => (
              <Tr key={r.id} class={ctx.me?.id === r.id ? 'me' : ''}>
                <Td align="right" class="ink-3">
                  {by === 'profit' ? r.rankByProfit : r.rankByAccuracy}
                </Td>
                <Td>
                  <span class="trader-cell">
                    <Avatar name={r.name} kind={r.kind} size={24} />
                    <span class="trader-name">{r.name}</span>
                    {r.kind === 'agent' && <span class="ink-3 t-caption">AI agent</span>}
                    {ctx.me?.id === r.id && <span class="ink-3 t-caption">you</span>}
                  </span>
                </Td>
                <Td hideSm class="ink-2">
                  {r.org || '—'}
                </Td>
                <Td align="right">
                  <Money cents={r.profit} signed />
                </Td>
                <Td align="right" hideSm>
                  <Money cents={r.realized} signed />
                </Td>
                <Td align="right" hideXs>
                  {r.brier === null ? <span class="ink-3">—</span> : r.brier.toFixed(3)}
                </Td>
                <Td align="right" hideSm>
                  {r.scored ? `${count(r.hits)} of ${count(r.scored)}` : '—'}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>
      <p class="t-caption ink-3 foot-note">Brier is the mean squared error of a trader's implied forecasts; lower is better. "Right" counts markets where the side held at close won.</p>
    </>
  );
}
