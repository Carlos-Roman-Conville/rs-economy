// TESTS.md X: declared boundary flows (ECON-32).
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as kernel from '@rex/kernel'
import { Runner, stock } from '../src/index.ts'
import { adjust, type Ctx } from '../src/context.ts'
import { goodsLedger } from '../src/goods-ledger.ts'
import { production, spoilage, STEPS } from '../src/tick/index.ts'

vi.mock('@rex/kernel', async importOriginal => {
  const actual = await importOriginal<typeof kernel>()
  return { ...actual, transfer: vi.fn(actual.transfer) }
})

function setup(rate = 0.125) {
  const runner = new Runner()
  for (const id of ['grain', 'fruit']) runner.run({ type: 'defineGood', good: { id, type: null, weight: null, spoilagePerDay: rate, legal: null } })
  runner.run({ type: 'openMarket', id: 'port', mode: 'abstract' })
  const stall = runner.state.markets.port.inventory
  const buyer = runner.run({ type: 'openInventory', holder: 'buyer', market: 'port' }).minted!
  for (const good of ['grain', 'fruit']) {
    runner.run({ type: 'setMarketGood', market: 'port', good, productionPerDay: 4, basePrice: 2 })
    runner.run({ type: 'addStock', inventory: stall, good, units: 20 })
  }
  return { runner, stall, buyer }
}
function context(runner: Runner): Ctx {
  return { state: structuredClone(runner.state), config: runner.config, providers: runner.providers, events: [], minted: null, taken: null }
}
function record() {
  const entries: kernel.TransferEntry[] = []
  const spy = vi.mocked(kernel.transfer)
  spy.mockClear()
  const append = kernel.TransferJournal.prototype.append
  vi.spyOn(kernel.TransferJournal.prototype, 'append').mockImplementation(function (this: kernel.TransferJournal, entry) {
    append.call(this, entry)
    entries.push({ ...entry })
  })
  return { entries, spy }
}
const account = (id: string) => `economy.goods/${id}`
afterEach(() => vi.restoreAllMocks())

describe('XBF1 abstract production declares its source', () => {
  it('records exactly one count entry per good per day with the original stock delta', () => {
    const { runner, stall } = setup()
    const ctx = context(runner)
    const journal = new kernel.TransferJournal()
    for (let day = 0; day < 2; day++) { ctx.state.day = day; production(ctx, journal) }
    expect(journal.entries()).toEqual([0, 1].flatMap(day => ['grain', 'fruit'].map(quantity => ({
      t: day * 86_400_000, process: 'economy.abstract-production', quantity, unit: 'count', amount: 4,
      from: account('boundary:economy.abstract-production'), to: account(stall),
    }))))
    for (const good of ['grain', 'fruit']) expect(stock(ctx.state, stall, good)).toBe(28)
    expect(ctx.events).toEqual([0, 1].flatMap(() => ['grain', 'fruit'].map(good => ({
      type: 'stockChanged', inventory: stall, good, delta: 4, reason: 'abstract-production',
    }))))
  })
})

describe('XBF2 spoilage declares its destination', () => {
  it('records the one-day fraction for each inventory and good', () => {
    const { runner, stall, buyer } = setup()
    runner.run({ type: 'addStock', inventory: buyer, good: 'grain', units: 8 })
    const ctx = context(runner)
    const journal = new kernel.TransferJournal()
    spoilage(ctx, journal)
    expect(journal.entries()).toEqual([[stall, 'grain', 2.5], [stall, 'fruit', 2.5], [buyer, 'grain', 1]].map(([id, quantity, amount]) => ({
      t: 0, process: 'economy.spoilage', quantity, unit: 'count', amount,
      from: account(String(id)), to: account('boundary:economy.spoilage'),
    })))
    expect(stock(ctx.state, stall, 'grain')).toBe(17.5)
    expect(stock(ctx.state, buyer, 'grain')).toBe(7)
  })
})

describe('XBF3 host stock commands declare boundaries', () => {
  it('adds and removes through exactly one transfer each with unchanged reasons', () => {
    const { runner, stall } = setup()
    runner.run({ type: 'tick' })
    const { entries, spy } = record()
    for (const type of ['addStock', 'removeStock'] as const) runner.run({ type, inventory: stall, good: 'grain', units: 3 })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(entries).toEqual(['add-stock', 'remove-stock'].map((process, index) => ({
      t: 86_400_000, process: `economy.${process}`, quantity: 'grain', unit: 'count', amount: 3,
      from: account(index === 0 ? `boundary:economy.${process}` : stall),
      to: account(index === 0 ? stall : `boundary:economy.${process}`),
    })))
    expect(runner.events.slice(-2)).toEqual([
      { type: 'stockChanged', inventory: stall, good: 'grain', delta: 3, reason: 'add' },
      { type: 'stockChanged', inventory: stall, good: 'grain', delta: -3, reason: 'remove' },
    ])
  })
  it('refuses excess removal before transfer with state, events and journal unchanged', () => {
    const { runner, stall } = setup()
    const before = structuredClone({ state: runner.state, events: runner.events, log: runner.log })
    const { entries, spy } = record()
    expect(() => runner.run({ type: 'removeStock', inventory: stall, good: 'grain', units: 21 })).toThrow(/cannot remove/)
    expect({ state: runner.state, events: runner.events, log: runner.log }).toEqual(before)
    expect(entries).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('XBF4 zero flows preserve legacy behavior', () => {
  it('skips zero production and empty inventories and preserves zero command events', () => {
    const { runner, stall } = setup()
    const ctx = context(runner)
    ctx.state.inventories[stall].stock = {}
    for (const entry of Object.values(ctx.state.markets.port.goods)) entry.productionPerDay = 0
    const journal = new kernel.TransferJournal()
    production(ctx, journal); spoilage(ctx, journal)
    expect(journal.entries()).toEqual([])
    expect(ctx.events).toEqual([])
    const { entries } = record()
    const added = runner.run({ type: 'addStock', inventory: stall, good: 'grain', units: 0 })
    const removed = runner.run({ type: 'removeStock', inventory: stall, good: 'grain', units: 0 })
    expect(added.events[0]).toEqual({ type: 'stockChanged', inventory: stall, good: 'grain', delta: 0, reason: 'add' })
    expect(removed.events[0]).toEqual({ type: 'stockChanged', inventory: stall, good: 'grain', delta: -0, reason: 'remove' })
    expect(entries).toEqual([])
  })
})

describe('XBF5 full spoilage empties stock', () => {
  it('transfers all units at rate one and leaves exactly zero', () => {
    const { runner, stall } = setup(1)
    const ctx = context(runner)
    const journal = new kernel.TransferJournal()
    spoilage(ctx, journal)
    expect(journal.entries().map(entry => entry.amount)).toEqual([20, 20])
    expect(stock(ctx.state, stall, 'grain')).toBe(0)
    expect(ctx.state.inventories[stall].stock).toEqual({})
  })
})

describe('XBF6 per-account reconciliation', () => {
  it('reconciles every inventory and good over five days of production, spoilage and buying', () => {
    const { runner, buyer } = setup()
    const opening = structuredClone(runner.state)
    const { entries } = record()
    for (let day = 0; day < 5; day++) {
      runner.run({ type: 'tick' })
      runner.run({ type: 'buy', inventory: buyer, good: 'grain', units: 1, price: 2 })
    }
    for (const inv of Object.values(runner.state.inventories)) for (const good of Object.keys(runner.state.goods)) {
      let closing = stock(opening, inv.id, good)
      for (const entry of entries.filter(entry => entry.quantity === good)) {
        if (entry.to === account(inv.id)) closing += entry.amount
        if (entry.from === account(inv.id)) closing -= entry.amount
      }
      expect(closing).toBe(stock(runner.state, inv.id, good))
    }
  })
})

describe('XBF7 thirty-day legacy compatibility', () => {
  it('matches state and events from the original adjust-based daily steps', () => {
    const run = () => {
      const { runner, buyer } = setup()
      runner.run({ type: 'setMarketGood', market: 'port', good: 'fruit', consumptionPerDay: 1 })
      for (let day = 0; day < 30; day++) {
        runner.run({ type: 'tick' })
        runner.run({ type: 'buy', inventory: buyer, good: 'grain', units: 1, price: 2 })
      }
      return { state: runner.state, events: runner.events }
    }
    const actual = run()
    const originalProduction = STEPS.production
    const originalSpoilage = STEPS.spoilage
    try {
      STEPS.production = ctx => {
        for (const mkt of Object.values(ctx.state.markets)) {
          if (mkt.mode === 'abstract') for (const [good, entry] of Object.entries(mkt.goods)) {
            if (entry.productionPerDay === null || entry.productionPerDay <= 0) continue
            adjust(ctx, ctx.state.inventories[mkt.inventory], good, entry.productionPerDay, 'abstract-production')
            entry.producedToday += entry.productionPerDay
          }
          for (const entry of Object.values(mkt.goods)) { entry.producedLast = entry.producedToday; entry.producedToday = 0 }
        }
      }
      STEPS.spoilage = ctx => {
        for (const inv of Object.values(ctx.state.inventories)) for (const [good, units] of Object.entries(inv.stock)) {
          const rate = ctx.state.goods[good]?.spoilagePerDay ?? null
          if (rate === null || rate <= 0 || units <= 0) continue
          const lost = units * rate
          adjust(ctx, inv, good, -lost, 'spoilage')
          ctx.events.push({ type: 'spoiled', inventory: inv.id, good, units: lost })
        }
      }
      expect(actual).toEqual(run())
    } finally { STEPS.production = originalProduction; STEPS.spoilage = originalSpoilage }
  })
})

describe('XBF8 consumption stays outside boundary transfers', () => {
  it('draws market stock without any transfer entry', () => {
    const { runner, stall } = setup(0)
    for (const good of ['grain', 'fruit']) runner.run({ type: 'setMarketGood', market: 'port', good, productionPerDay: 0, consumptionPerDay: 2 })
    const { entries, spy } = record()
    runner.run({ type: 'tick' })
    expect(stock(runner.state, stall, 'grain')).toBe(18)
    expect(entries).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('XBF9 declared boundaries hold nothing', () => {
  it('accepts only four named processes and known goods with no state or event effects', () => {
    const { runner } = setup()
    const ctx = context(runner)
    const ledger = goodsLedger(ctx, 'test')
    const before = structuredClone({ state: ctx.state, events: ctx.events })
    for (const process of ['abstract-production', 'spoilage', 'add-stock', 'remove-stock']) {
      const id = `boundary:economy.${process}`
      expect(ledger.unit(id, 'grain')).toBe('count')
      expect(() => ledger.unit(id, 'missing')).toThrow(/good/)
      ledger.apply(id, 'grain', 5); ledger.apply(id, 'grain', -5)
    }
    expect(() => ledger.unit('boundary:unknown', 'grain')).toThrow(/boundary/)
    expect(() => ledger.apply('boundary:unknown', 'grain', 5)).toThrow(/boundary/)
    expect({ state: ctx.state, events: ctx.events }).toEqual(before)
  })
})
