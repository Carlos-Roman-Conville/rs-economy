// TESTS.md B: money and goods commit together (CONTRACTS §20).
import { describe, expect, it, vi } from 'vitest'
import { Runner, stock, stubProviders } from '../src/index.ts'
import { goodsLedger } from '../src/goods-ledger.ts'
import type { Ctx } from '../src/context.ts'

function providers() {
  const result = stubProviders()
  result.transport.set('a', 'b', 1)
  return result
}
function setup() {
  const p = providers()
  const runner = new Runner(undefined, undefined, p)
  runner.run({ type: 'defineGood', good: { id: 'grain', type: null, weight: null, spoilagePerDay: null, legal: null } })
  for (const id of ['a', 'b']) runner.run({ type: 'openMarket', id, mode: 'abstract' })
  const inv = runner.run({ type: 'openInventory', holder: 'trader', market: 'a' }).minted!
  const dest = runner.run({ type: 'openInventory', holder: 'trader', market: 'b' }).minted!
  const stall = runner.state.markets.a.inventory
  runner.run({ type: 'addStock', inventory: stall, good: 'grain', units: 20 })
  return { runner, p, inv, dest, stall }
}
const changed = (inventory: string, delta: number, reason: string) =>
  ({ type: 'stockChanged', inventory, good: 'grain', delta, reason })

for (const side of ['buy', 'sell'] as const) {
  describe(`${side === 'buy' ? 'B1' : 'B2'} ${side} commits money and goods in one provider call`, () => {
    it('conserves both quantities and preserves row and event bytes', () => {
      const { runner, p, inv, stall } = setup()
      if (side === 'sell') runner.run({ type: 'addStock', inventory: inv, good: 'grain', units: 5 })
      p.ledger.balances = { trader: 100, a: 100 }
      const spy = vi.spyOn(p.ledger, 'transfer')
      const result = runner.run({ type: side, inventory: inv, good: 'grain', units: 5, price: 2 })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][6]).toMatchObject({ from: side === 'buy' ? stall : inv,
        to: side === 'buy' ? inv : stall, good: 'grain', units: 5 })
      const sign = side === 'buy' ? 1 : -1
      expect(p.ledger.balances).toEqual({ trader: 100 - sign * 10, a: 100 + sign * 10 })
      expect(stock(runner.state, stall, 'grain')).toBe(20 - sign * 5)
      expect(stock(runner.state, inv, 'grain')).toBe(side === 'buy' ? 5 : 0)
      expect(p.ledger.log).toEqual([{ id: 'txn.0001', day: 0, kind: side === 'buy' ? 'purchase' : 'sale',
        from: side === 'buy' ? 'trader' : 'a', to: side === 'buy' ? 'a' : 'trader', subject: 'grain',
        amount: 10, authority: null, note: '5 @ 2' }])
      expect(JSON.stringify(result.events)).toBe(JSON.stringify([
        changed(side === 'buy' ? stall : inv, -5, side), changed(side === 'buy' ? inv : stall, 5, side),
        { type: side === 'buy' ? 'bought' : 'sold', inventory: inv, market: 'a', good: 'grain',
          units: 5, price: 2, amount: 10, txn: 'txn.0001' },
      ]))
    })
  })
}

describe('B3 goods refusal rolls back money, goods, rows and events', () => {
  it('restores the money leg when goods overdraw throws inside the batch', () => {
    const { runner, p, inv, stall } = setup()
    p.ledger.transfer('patron', 'trader', 100, 'gift', null)
    const ctx: Ctx = { state: structuredClone(runner.state), config: runner.config, providers: p,
      events: [{ type: 'dayEnded', day: 0 }], minted: null, taken: null }
    const snapshot = () => JSON.stringify({ balances: p.ledger.balances, log: p.ledger.log,
      inventories: ctx.state.inventories, events: ctx.events })
    const before = snapshot()
    expect(() => p.ledger.transfer('trader', 'a', 42, 'purchase', 'grain', '',
      { ledger: goodsLedger(ctx, 'buy'), from: stall, to: inv, good: 'grain', units: 21 })).toThrow(/would go negative/)
    expect(snapshot()).toBe(before)
  })
})

describe('B4 self-trades keep the legacy path', () => {
  it('passes no goods argument and retains both adjustments and the trade event', () => {
    const { runner, p, stall } = setup()
    const spy = vi.spyOn(p.ledger, 'transfer')
    for (const side of ['buy', 'sell'] as const) {
      const result = runner.run({ type: side, inventory: stall, good: 'grain', units: 5, price: 2 })
      expect(spy.mock.lastCall).toHaveLength(6)
      expect(result.events).toEqual([changed(stall, -5, side), changed(stall, 5, side),
        { type: side === 'buy' ? 'bought' : 'sold', inventory: stall, market: 'a', good: 'grain',
          units: 5, price: 2, amount: 10, txn: side === 'buy' ? 'txn.0001' : 'txn.0002' }])
      expect(stock(runner.state, stall, 'grain')).toBe(20)
    }
  })
})

describe('B5 fractional units are conserved exactly', () => {
  it('moves 2.5 units and their price in both directions', () => {
    const { runner, p, inv, stall } = setup()
    for (const side of ['buy', 'sell'] as const) {
      runner.run({ type: side, inventory: inv, good: 'grain', units: 2.5, price: 2 })
      expect(stock(runner.state, inv, 'grain')).toBe(side === 'buy' ? 2.5 : 0)
      expect(stock(runner.state, stall, 'grain')).toBe(side === 'buy' ? 17.5 : 20)
      expect(p.ledger.balance('trader')).toBe(side === 'buy' ? -5 : 0)
      expect(p.ledger.balance('a')).toBe(side === 'buy' ? 5 : 0)
    }
  })
})

describe('B6 joint replay preserves state, events and rows with debt allowed', () => {
  it('replays buys, sells, freight and arrival byte for byte (E3; Q19, ECON-26 open)', () => {
    const { runner, p, inv, dest } = setup()
    expect(p.ledger.balance('trader')).toBe(0)
    runner.run({ type: 'buy', inventory: inv, good: 'grain', units: 8, price: 2 })
    expect(p.ledger.balance('trader')).toBe(-16)
    runner.run({ type: 'sell', inventory: inv, good: 'grain', units: 3, price: 2 })
    runner.run({ type: 'ship', from: inv, to: dest, good: 'grain', units: 5,
      freight: { payer: 'trader', payee: 'master', amount: 1 } })
    runner.run({ type: 'tick' }); runner.run({ type: 'tick' })
    const againProviders = providers()
    const again = Runner.replay(runner.log, runner.config, againProviders)
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(runner.state))
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(runner.events))
    expect(JSON.stringify(againProviders.ledger)).toBe(JSON.stringify(p.ledger))
  })
})
