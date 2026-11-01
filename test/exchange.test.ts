import { describe, expect, it, vi } from 'vitest'
import { Runner, StubLedger, currencyProvider, isCurrency, stock, stubProviders } from '../src/index.ts'
import type { Ctx } from '../src/context.ts'
import { goodsLedger } from '../src/goods-ledger.ts'
import { simulate } from '../examples/three-ports.ts'

function setup() {
  const p = stubProviders()
  const runner = new Runner(undefined, undefined, p)
  p.ledger.currencies = currencyProvider(() => runner.state)
  runner.run({ type: 'defineGood', good: { id: 'grain', type: null, weight: null, spoilagePerDay: null, legal: null } })
  runner.run({ type: 'defineCurrency', currency: { id: 'silver', issuer: 'mint', backing: 'grain' } })
  runner.run({ type: 'openMarket', id: 'port', mode: 'abstract' })
  const from = runner.state.markets.port.inventory
  const to = runner.run({ type: 'openInventory', holder: 'buyer', market: 'port' }).minted!
  runner.run({ type: 'addStock', inventory: from, good: 'grain', units: 10 })
  const ctx: Ctx = { state: structuredClone(runner.state), config: runner.config, providers: p,
    events: [{ type: 'dayEnded', day: 0 }], minted: null, taken: null }
  const money = [{ from: 'buyer', to: 'seller', currency: 'money', amount: 6 },
    { from: 'seller', to: 'buyer', currency: 'silver', amount: 2.5 }]
  const goods = [{ from, to, good: 'grain', units: 3 }]
  const snapshot = () => structuredClone({ balances: p.ledger.balances, byCurrency: p.ledger.byCurrency,
    log: p.ledger.log, inventories: ctx.state.inventories, events: ctx.events })
  return { runner, p, ctx, from, to, money, goods, snapshot }
}

describe('X1 currency definition and pure membership', () => {
  it('records nullable metadata, emits currencyDefined and exposes a live pure provider', () => {
    const runner = new Runner()
    const provider = currencyProvider(() => runner.state)
    expect(provider.isCurrency('silver')).toBe(false)
    expect(runner.run({ type: 'defineCurrency', currency: { id: 'silver' } }).events)
      .toEqual([{ type: 'currencyDefined', currency: 'silver' }])
    expect(runner.state.currencies).toEqual({ silver: { id: 'silver', issuer: null, backing: null } })
    const before = JSON.stringify(runner.state)
    expect(provider.isCurrency('silver')).toBe(true)
    expect(isCurrency(runner.state, 'money')).toBe(true)
    expect(isCurrency(runner.state, 'toString')).toBe(false)
    expect(JSON.stringify(runner.state)).toBe(before)
    expect(setup().runner.state.currencies!.silver).toEqual({ id: 'silver', issuer: 'mint', backing: 'grain' })
  })
  it.each([{ id: '' }, { id: 'money' }, { id: 'silver' }, { id: 'paper', backing: 'missing' }])(
    'refuses invalid currency %j without changes', currency => {
      const { runner } = setup()
      const before = JSON.stringify([runner.state, runner.log, runner.events])
      expect(() => runner.run({ type: 'defineCurrency', currency })).toThrow()
      expect(JSON.stringify([runner.state, runner.log, runner.events])).toBe(before)
    })
})

describe('X2 multi-currency conservation and rows', () => {
  it('moves every asset exactly, allows debt and batches rows in input order', () => {
    const { p, ctx, from, to, money, goods } = setup()
    p.ledger.day = 3
    expect(p.ledger.exchange({ money, goods }, 'swap', 'grain', 'agreed', goodsLedger(ctx, 'exchange')))
      .toEqual(['txn.0001', 'txn.0002'])
    expect(p.ledger.balances).toEqual({ buyer: -6, seller: 6 })
    expect(p.ledger.byCurrency).toEqual({ silver: { seller: -2.5, buyer: 2.5 } })
    expect(stock(ctx.state, from, 'grain')).toBe(7)
    expect(stock(ctx.state, to, 'grain')).toBe(3)
    expect(p.ledger.log).toEqual(money.map((leg, i) => ({ id: `txn.000${i + 1}`, day: 3, kind: 'swap',
      from: leg.from, to: leg.to, subject: 'grain', amount: leg.amount, authority: null, note: 'agreed',
      ...(i ? { currency: 'silver' } : {}), batch: 'txn.0001' })))
    for (const balances of [p.ledger.balances, ...Object.values(p.ledger.byCurrency)]) {
      expect(Object.values(balances).reduce((a, b) => a + b, 0)).toBe(0)
    }
  })
})

describe('X3 barter has no money rows', () => {
  it('moves ordered goods legs and returns no ids', () => {
    const { p, ctx, from, to, goods } = setup()
    goods.push({ from: to, to: from, good: 'grain', units: 1 })
    expect(p.ledger.exchange({ money: [], goods }, 'barter', null, '', goodsLedger(ctx, 'exchange'))).toEqual([])
    expect(p.ledger.log).toEqual([])
    expect(stock(ctx.state, from, 'grain')).toBe(8)
    expect(stock(ctx.state, to, 'grain')).toBe(2)
  })
})

describe('X4 skipped legs retain their money rows', () => {
  it('skips zero and self money and zero goods without creating balances or events', () => {
    const { p, ctx, goods } = setup()
    const before = structuredClone(ctx.events)
    const money = [{ from: 'a', to: 'b', currency: 'silver', amount: 0 },
      { from: 'a', to: 'a', currency: 'money', amount: 10 }]
    expect(p.ledger.exchange({ money, goods: [{ ...goods[0], units: 0 }] }, 'swap', null, '', goodsLedger(ctx, 'exchange'))).toHaveLength(2)
    expect(p.ledger.balances).toEqual({})
    expect(p.ledger.byCurrency).toEqual({})
    expect(ctx.events).toEqual(before)
    expect(p.ledger.log.map(r => r.batch)).toEqual(['txn.0001', 'txn.0001'])
  })
})

describe('X5 refusal rolls back every asset and event', () => {
  it('restores two currencies, earlier goods, existing rows and events on a late overdraw', () => {
    const { p, ctx, money, goods, snapshot } = setup()
    p.ledger.transfer('buyer', 'seller', 1, 'seed', null)
    const before = snapshot()
    expect(() => p.ledger.exchange({ money, goods: [...goods, { ...goods[0], units: 8 }] },
      'swap', null, '', goodsLedger(ctx, 'exchange'))).toThrow(/would go negative/)
    expect(snapshot()).toEqual(before)
  })
})

describe('X6 unknown currency and invalid legs have no effects', () => {
  it('refuses unknown currencies even on skipped legs and balance queries', () => {
    const { p, money, snapshot, runner } = setup()
    const before = snapshot()
    expect(() => p.ledger.exchange({ money: [...money, { ...money[0], currency: 'unknown', amount: 0 }] }, 'swap', null))
      .toThrow('unknown currency: unknown')
    expect(() => p.ledger.balance('buyer', 'unknown')).toThrow('unknown currency: unknown')
    expect(() => new StubLedger().balance('buyer', 'silver')).toThrow('unknown currency: silver')
    expect(() => runner.run({ type: 'exchange', legs: { money: [{ ...money[0], currency: 'unknown' }] } })).toThrow('unknown currency: unknown')
    expect(snapshot()).toEqual(before)
  })
  it.each([-1, NaN, Infinity])('validates all amounts and units first: %s', invalid => {
    const { p, ctx, money, goods, snapshot } = setup()
    const before = snapshot()
    expect(() => p.ledger.exchange({ money: [...money, { ...money[0], amount: invalid }] }, 'swap', null)).toThrow()
    expect(() => p.ledger.exchange({ money, goods: [{ ...goods[0], units: invalid }] }, 'swap', null, '', goodsLedger(ctx, 'exchange'))).toThrow()
    expect(snapshot()).toEqual(before)
  })
  it('requires goods and ledger together and validates zero-leg references', () => {
    const { p, ctx, money, goods, snapshot } = setup()
    const before = snapshot()
    expect(() => p.ledger.exchange({ money, goods }, 'swap', null)).toThrow(/goods ledger/)
    expect(() => p.ledger.exchange({ money }, 'swap', null, '', goodsLedger(ctx, 'exchange'))).toThrow(/goods legs/)
    expect(() => p.ledger.exchange({ money, goods: [{ ...goods[0], to: 'missing', units: 0 }] }, 'swap', null, '', goodsLedger(ctx, 'exchange'))).toThrow()
    expect(snapshot()).toEqual(before)
  })
})

describe('X7 unseen balances are pure zero reads', () => {
  it('does not create entries for a known currency never moved', () => {
    const { p } = setup()
    expect(p.ledger.balance('unseen', 'silver')).toBe(0)
    expect(p.ledger.balance('unseen')).toBe(0)
    expect(p.ledger.byCurrency).toEqual({})
    expect(p.ledger.balances).toEqual({})
  })
})

describe('X8 caused exchange outcomes', () => {
  it('completes with leg and row counts and forwards the optional metadata', () => {
    const { runner, p, money, goods } = setup()
    const spy = vi.spyOn(p.ledger, 'exchange')
    const result = runner.run({ type: 'exchange', legs: { money, goods }, cause: 'intent', kind: 'swap', subject: 'grain', note: 'terms' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.events.at(-1)).toMatchObject({ type: 'shared.action.outcome', cause: 'intent', status: 'completed',
      stimuli: [{ legs: 3, txns: 2 }], payload: { type: 'exchanged', money, goods, txns: ['txn.0001', 'txn.0002'] } })
    expect(result.events.every(e => e.cause === 'intent')).toBe(true)
    expect(p.ledger.log[0]).toMatchObject({ kind: 'swap', subject: 'grain', note: 'terms' })
  })
  it('fails cumulative overdraw before calling the ledger and throws without a cause', () => {
    const { runner, p, money, goods } = setup()
    const spy = vi.spyOn(p.ledger, 'exchange')
    const legs = { money, goods: [...goods, { ...goods[0], units: 8 }] }
    const before = JSON.stringify([runner.state, p.ledger.balances, p.ledger.byCurrency, p.ledger.log])
    const refused = { type: 'refused', command: 'exchange', reason: 'beyond-stock', price: null, units: 8, available: 7, cause: 'intent' }
    const result = runner.run({ type: 'exchange', legs, cause: 'intent' })
    expect(result.events).toEqual([refused, { type: 'shared.action.outcome', cause: 'intent', status: 'failed',
      stimuli: [{ command: 'exchange', reason: 'beyond-stock', price: null, units: 8, available: 7 }], payload: refused }])
    expect(spy).not.toHaveBeenCalled()
    expect(() => runner.run({ type: 'exchange', legs })).toThrow(/cannot exchange/)
    expect(JSON.stringify([runner.state, p.ledger.balances, p.ledger.byCurrency, p.ledger.log])).toBe(before)
  })
})

describe('X9 optional host seam', () => {
  it('throws the explicit contract error when exchange is unavailable', () => {
    const { runner, p } = setup()
    runner.providers.ledger = { balance: p.ledger.balance.bind(p.ledger), transfer: p.ledger.transfer.bind(p.ledger), rows: p.ledger.rows.bind(p.ledger) }
    expect(() => runner.run({ type: 'exchange', legs: {} })).toThrow('ledger provider has no exchange (CONTRACTS §22)')
  })
})

describe('X10 one-currency compatibility', () => {
  it('leaves the currencies key absent in three-ports JSON', () => {
    expect(JSON.stringify(simulate().state)).not.toContain('"currencies"')
  })
})

describe('X11 deterministic joint replay', () => {
  it('replays currency definitions, exchanges, barter and refusal with identical state, events and ledger', () => {
    const { runner, p, money, goods } = setup()
    runner.run({ type: 'exchange', legs: { money, goods }, cause: 'trade' })
    runner.run({ type: 'exchange', legs: { goods }, cause: 'barter' })
    runner.run({ type: 'exchange', legs: { goods: [{ ...goods[0], units: 100 }] }, cause: 'refuse' })
    const providers = stubProviders()
    const again = new Runner(undefined, runner.config, providers)
    providers.ledger.currencies = currencyProvider(() => again.state)
    for (const command of runner.log) again.run(command)
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(runner.state))
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(runner.events))
    expect(JSON.stringify(providers.ledger)).toBe(JSON.stringify(p.ledger))
  })
})
