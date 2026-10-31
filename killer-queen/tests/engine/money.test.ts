import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMMAND_TYPES, assertNever, clampPrice, isCents, isPrice, marketId, midHalfUp, sha256, type Command } from '../../src/engine/index.js';

describe('cents and prices', () => {
  it('prices 0 and 100 are invalid; 1 and 99 are valid', () => {
    assert.equal(isPrice(0), false);
    assert.equal(isPrice(100), false);
    assert.equal(isPrice(1), true);
    assert.equal(isPrice(99), true);
    assert.equal(isPrice(50.5), false);
    assert.equal(isPrice('50'), false);
  });

  it('cents are safe integers only', () => {
    assert.equal(isCents(1), true);
    assert.equal(isCents(-1), true);
    assert.equal(isCents(1.5), false);
    assert.equal(isCents(NaN), false);
    assert.equal(isCents(Infinity), false);
  });

  it('clampPrice keeps 1..99', () => {
    assert.equal(clampPrice(-5), 1);
    assert.equal(clampPrice(150), 99);
    assert.equal(clampPrice(42.9), 42);
  });

  it('mid rounds half up (D7)', () => {
    assert.equal(midHalfUp(66, 71), 69); // 68.5 -> 69
    assert.equal(midHalfUp(60, 70), 65);
    assert.equal(midHalfUp(60, 61), 61); // 60.5 -> 61
  });

  it('market id is task:executor', () => {
    assert.equal(marketId('tsk_8f2a', 'codex'), 'tsk_8f2a:codex');
  });

  it('sha256 is hex and stable', () => {
    assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('command union is exhaustive in a switch', () => {
    const name = (c: Command): string => {
      switch (c.type) {
        case 'createAccount':
        case 'deposit':
        case 'upsertExecutor':
        case 'createTask':
        case 'placeOrder':
        case 'cancelOrder':
        case 'comment':
        case 'closeTask':
        case 'decide':
        case 'settle':
        case 'pauseTrading':
        case 'baseline':
        case 'reviewAccount':
        case 'closeAccount':
          return c.type;
        default:
          return assertNever(c);
      }
    };
    for (const t of COMMAND_TYPES) assert.equal(name({ type: t } as Command), t);
    assert.equal(COMMAND_TYPES.length, 14); // the spec's ten plus pauseTrading (D26), baseline (D2), reviewAccount (5.2), closeAccount (store)
    assert.throws(() => assertNever({ type: 'bogus' } as never), /Unhandled case/);
  });
});
