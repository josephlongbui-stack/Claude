/** Dev-only: every component in every state. */
import { ScrollView, Text, View } from 'react-native';
import { AgentRow, BookLadder, Button, EmptyState, ErrorState, H2, OrderTicket, PacketView, Panel, Pill, PlayMoney, PriceCell, Skeleton } from '../src/ui/components';
import { space, type, usePalette } from '../src/ui/tokens';

const executor = { id: 'codex', org: 'OpenAI', version: '0.48.0', chosen: 12, passed: 8 };
const row = (status: string, extra: Record<string, unknown> = {}) => ({ marketId: `tsk_1:${status}`, executorId: 'codex', executor, status, quote: { yesBid: 66, yesAsk: 71, volume: 120, chance: 69 }, closingPrice: 68, settlementPrice: null, outcome: null, traders: 5, ...extra });

export default function KitchenSink() {
  const p = usePalette();
  return (
    <ScrollView contentContainerStyle={{ padding: space.s4 }}>
      <Panel>
        <H2>Pills</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {['pending', 'open', 'closed', 'running', 'resolved', 'settled', 'skipped', 'rejected', 'cancelled', 'passed', 'failed'].map((s) => (
            <Pill key={s} status={s} />
          ))}
        </View>
      </Panel>
      <Panel>
        <H2>PriceCell</H2>
        <View style={{ flexDirection: 'row', gap: space.s3, alignItems: 'baseline' }}>
          <PriceCell value={69} />
          <PriceCell value={69} side="yes" />
          <PriceCell value={31} side="no" />
          <PriceCell value={null} />
          <PriceCell value={69} big />
        </View>
        <PlayMoney />
      </Panel>
      <Panel>
        <H2>AgentRow</H2>
        <AgentRow m={row('pending', { quote: { yesBid: null, yesAsk: null, volume: 0, chance: 50 } })} />
        <AgentRow m={row('open')} />
        <AgentRow m={row('running')} chosen />
        <AgentRow m={row('settled', { settlementPrice: 100, outcome: 'passed' })} chosen />
        <AgentRow m={row('settled', { settlementPrice: 68, outcome: 'unchosen' })} />
      </Panel>
      <Panel>
        <H2>BookLadder · full / thin / empty</H2>
        <BookLadder book={{ yes: [{ price: 66, quantity: 30, orders: 1 }, { price: 60, quantity: 40, orders: 3 }], no: [{ price: 29, quantity: 30, orders: 1 }] }} />
        <View style={{ height: space.s3 }} />
        <BookLadder book={{ yes: [{ price: 40, quantity: 1, orders: 1 }], no: [] }} />
        <View style={{ height: space.s3 }} />
        <BookLadder book={{ yes: [], no: [] }} />
      </Panel>
      <Panel>
        <H2>OrderTicket · open / signed out / pending</H2>
        <OrderTicket marketId="tsk_1:codex" open signedIn />
        <OrderTicket marketId="x" open signedIn={false} />
        <OrderTicket marketId="x" open={false} signedIn blockedReason="Trading opens after the baseline check." />
      </Panel>
      <Panel>
        <H2>PacketView</H2>
        <PacketView packet={{ prompt: 'POST /cart/items accepts quantity -3 …', repo: 'github.com/example-org/shop-api', commit: '58b0ce4', testCommand: 'pytest tests/api/test_cart.py', executor: { ...executor, name: 'Codex' }, baseline: 'failing 3/3' }} />
      </Panel>
      <Panel>
        <H2>Skeleton · EmptyState · ErrorState</H2>
        <Skeleton lines={3} />
        <View style={{ height: space.s3 }} />
        <EmptyState title="No tasks yet." hint="Submit one from the web app." />
        <View style={{ height: space.s3 }} />
        <ErrorState message="rate limited: 30 orders per minute" retry={() => undefined} />
        <Button label="Primary" kind="primary" onPress={() => undefined} />
        <Text style={[type.small, { color: p.muted }]}>Dynamic Type: all text scales with the system setting; Reduce Motion stops the skeleton shimmer.</Text>
      </Panel>
    </ScrollView>
  );
}
