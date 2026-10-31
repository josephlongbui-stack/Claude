import './book.css';

export interface Level {
  price: number;
  quantity: number;
  orders: number;
}

/** A real table: Yes bids | price | No bids around the spread; depth bars in the outcome tints. */
export function BookLadder({ book, status, depth = 5 }: { book: { yes: Level[]; no: Level[] }; status: string; depth?: number }) {
  const yes = book.yes.slice(0, depth);
  const asks = book.no.slice(0, depth).map((l) => ({ ...l, yesPrice: 100 - l.price }));
  const max = Math.max(1, ...yes.map((l) => l.quantity), ...asks.map((l) => l.quantity));
  const bestBid = yes[0]?.price ?? null;
  const bestAsk = asks[0]?.yesPrice ?? null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const n = yes.length + asks.length;
  if (status !== 'open' && n === 0) return <div class="book-note">The order book cleared when trading closed.</div>;
  if (n === 0) return <div class="book-note">No resting orders yet. The first limit order sets the price.</div>;
  const thin = yes.length === 0 || asks.length === 0;
  const w = (q: number) => `${Math.round((100 * q) / max)}%`;
  return (
    <div class="book-wrap">
      {thin && <div class="book-note warn">Thin book: only one side has resting orders, so one trade can move the price a lot.</div>}
      <table class="book" data-testid="book">
        <caption class="sr-only">Order book: Yes bids, price, No bids</caption>
        <thead>
          <tr>
            <th scope="col" class="yes-h">Yes bids</th>
            <th scope="col" class="px-h">Price</th>
            <th scope="col" class="no-h">No bids</th>
          </tr>
        </thead>
        <tbody>
          {[...asks].reverse().map((l) => (
            <tr key={`a${l.price}`} class="ask">
              <td class="lvl yes" />
              <td class="px no">{l.yesPrice}¢</td>
              <td class="lvl no">
                <span class="depth" style={{ width: w(l.quantity) }} />
                <span class="q">
                  {l.quantity}
                  <span class="sr-only"> No at {l.price} cents</span>
                </span>
              </td>
            </tr>
          ))}
          <tr class="mid">
            <td class="lvl yes" />
            <td class="px mid">{spread === null ? (yes.length === 0 ? 'no bids' : 'no asks') : `spread ${spread}¢`}</td>
            <td class="lvl no" />
          </tr>
          {yes.map((l) => (
            <tr key={`b${l.price}`} class="bid">
              <td class="lvl yes">
                <span class="depth" style={{ width: w(l.quantity) }} />
                <span class="q">
                  {l.quantity}
                  <span class="sr-only"> Yes at {l.price} cents</span>
                </span>
              </td>
              <td class="px yes">{l.price}¢</td>
              <td class="lvl no" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
