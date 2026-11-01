import { describe, expect, it, vi } from 'vitest'
import { Runner, marketStock, stock, stubProviders, totalUnits, type Command } from '../src/index.ts'

function setup() {
  const providers = stubProviders()
  const runner = new Runner(undefined, undefined, providers)
  runner.run({ type: 'defineGood', good: { id: 'grain', type: null, weight: null, spoilagePerDay: null, legal: null } })
  runner.run({ type: 'openMarket', id: 'market', mode: 'abstract' })
  runner.run({ type: 'setMarketGood', market: 'market', good: 'grain', basePrice: 2 })
  const inventory = runner.run({ type: 'openInventory', holder: 'holder', market: 'market' }).minted!
  runner.run({ type: 'addStock', inventory: runner.state.markets.market.inventory, good: 'grain', units: 10 })
  runner.run({ type: 'addStock', inventory, good: 'grain', units: 5 })
  providers.ledger.balances = { holder: 100, market: 100 }
  return { runner, inventory, ledger: providers.ledger }
}

describe('I1 accepted buy intention conserves goods and money', () => {
  it.each([2, 3])('buys three units at the market price within priceMax %s and tags every event', (priceMax) => {
    const { runner, inventory, ledger } = setup()
    const result = runner.run({ type: 'buy', inventory, good: 'grain', units: 3, priceMax, cause: 'int.1' })
    expect(marketStock(runner.state, 'market', 'grain')).toBe(7)
    expect(stock(runner.state, inventory, 'grain')).toBe(8)
    expect(totalUnits(runner.state, 'grain')).toBe(15)
    expect(ledger.balances).toEqual({ holder: 94, market: 106 })
    expect(ledger.log).toHaveLength(1)
    expect(ledger.log[0]).toMatchObject({ from: 'holder', to: 'market', amount: 6 })
    expect(result.events).toHaveLength(3)
    expect(result.events.every(event => event.cause === 'int.1')).toBe(true)
  })
})

describe('I2 limit misses leave state and providers untouched', () => {
  it.each(['buy', 'sell'] as const)('%s emits exactly one caused refusal', (type) => {
    const { runner, inventory, ledger } = setup()
    const before = JSON.stringify(runner.state)
    const transfer = vi.spyOn(ledger, 'transfer')
    const command: Command = type === 'buy'
      ? { type, inventory, good: 'grain', units: 3, priceMax: 1, cause: 'int.2' }
      : { type, inventory, good: 'grain', units: 3, priceMin: 3, cause: 'int.2' }
    expect(runner.run(command).events).toEqual([{ type: 'refused', command: type,
      reason: type === 'buy' ? 'price-above-limit' : 'price-below-limit', price: 2,
      limit: type === 'buy' ? 1 : 3, cause: 'int.2' }])
    expect(JSON.stringify(runner.state)).toBe(before)
    expect(ledger.balances).toEqual({ holder: 100, market: 100 })
    expect(ledger.log).toEqual([])
    expect(transfer).not.toHaveBeenCalled()
  })
})

describe('I3 accepted sell intention conserves goods and money', () => {
  it.each([1, 2])('sells three units within priceMin %s and tags every event', (priceMin) => {
    const { runner, inventory, ledger } = setup()
    const result = runner.run({ type: 'sell', inventory, good: 'grain', units: 3, priceMin, cause: 'int.3' })
    expect(marketStock(runner.state, 'market', 'grain')).toBe(13)
    expect(stock(runner.state, inventory, 'grain')).toBe(2)
    expect(totalUnits(runner.state, 'grain')).toBe(15)
    expect(ledger.balances).toEqual({ holder: 106, market: 94 })
    expect(ledger.log).toHaveLength(1)
    expect(ledger.log[0]).toMatchObject({ from: 'market', to: 'holder', amount: 6 })
    expect(result.events).toHaveLength(3)
    expect(result.events.every(event => event.cause === 'int.3')).toBe(true)
  })
})

describe('I4 cause is generic and absent causes preserve event shapes', () => {
  it('keeps the exact original buy events without cause', () => {
    const { runner, inventory } = setup()
    expect(runner.run({ type: 'buy', inventory, good: 'grain', units: 3 }).events).toEqual([
      { type: 'stockChanged', inventory: runner.state.markets.market.inventory, good: 'grain', delta: -3, reason: 'buy' },
      { type: 'stockChanged', inventory, good: 'grain', delta: 3, reason: 'buy' },
      { type: 'bought', inventory, market: 'market', good: 'grain', units: 3, price: 2, amount: 6, txn: 'txn.0001' },
    ])
    expect(runner.events.every(event => !Object.hasOwn(event, 'cause'))).toBe(true)
  })
  it('also tags non-trade events and rejects empty causes before any transfer', () => {
    const { runner, inventory, ledger } = setup()
    expect(runner.run({ type: 'openOrganisation', name: 'Company', cause: 'int.org' }).events)
      .toEqual([{ type: 'organisationOpened', organisation: 'org.0001', name: 'Company', cause: 'int.org' }])
    const before = JSON.stringify([runner.state, runner.log, runner.events])
    expect(() => runner.run({ type: 'buy', inventory, good: 'grain', units: 3, cause: '' })).toThrow(/cause/)
    expect(JSON.stringify([runner.state, runner.log, runner.events])).toBe(before)
    expect(ledger.log).toEqual([])
  })
})

describe('I5 refused intentions are logged and replay deterministically (E3)', () => {
  it('replays the same state and events including the refusal cause', () => {
    const { runner, inventory } = setup()
    const command: Command = { type: 'buy', inventory, good: 'grain', units: 3, priceMax: 1, cause: 'int.replay' }
    const length = runner.log.length
    runner.run(command)
    expect(runner.log).toHaveLength(length + 1)
    const again = Runner.replay(runner.log)
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(runner.state))
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(runner.events))
  })
})

describe('I6 invalid limits and existing trade errors still throw', () => {
  it.each([NaN, -1, Infinity])('rejects invalid buy and sell limits %s without effects', (limit) => {
    const { runner, inventory, ledger } = setup()
    const before = JSON.stringify([runner.state, runner.log, runner.events])
    expect(() => runner.run({ type: 'buy', inventory, good: 'grain', units: 3, priceMax: limit })).toThrow(/priceMax/)
    expect(() => runner.run({ type: 'sell', inventory, good: 'grain', units: 3, priceMin: limit })).toThrow(/priceMin/)
    expect(JSON.stringify([runner.state, runner.log, runner.events])).toBe(before)
    expect(ledger.log).toEqual([])
  })
  it('does not mask bad units, excess stock or missing price with a limit refusal', () => {
    const { runner, inventory, ledger } = setup()
    expect(() => runner.run({ type: 'buy', inventory, good: 'grain', units: 0, priceMax: 0 })).toThrow(/units/)
    expect(() => runner.run({ type: 'buy', inventory, good: 'grain', units: 11, priceMax: 0 })).toThrow(/market has/)
    expect(() => runner.run({ type: 'sell', inventory, good: 'grain', units: 6, priceMin: 3 })).toThrow(/have 5/)
    runner.run({ type: 'setMarketGood', market: 'market', good: 'grain', basePrice: null })
    expect(() => runner.run({ type: 'buy', inventory, good: 'grain', units: 1, priceMax: 0 })).toThrow(/no price/)
    expect(ledger.log).toEqual([])
  })
})

describe('I7 explicit prices take precedence for limits', () => {
  it('compares the given price, including zero, rather than the market price', () => {
    const { runner, inventory, ledger } = setup()
    expect(runner.run({ type: 'buy', inventory, good: 'grain', units: 1, price: 3, priceMax: 2 }).events)
      .toEqual([{ type: 'refused', command: 'buy', reason: 'price-above-limit', price: 3, limit: 2 }])
    runner.run({ type: 'buy', inventory, good: 'grain', units: 1, price: 0, priceMax: 0 })
    runner.run({ type: 'sell', inventory, good: 'grain', units: 1, price: 3, priceMin: 3 })
    expect(ledger.log.map(row => row.amount)).toEqual([0, 3])
  })
})
