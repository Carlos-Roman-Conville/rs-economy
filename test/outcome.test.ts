import { describe, expect, it, vi } from 'vitest'
import { Runner, marketStock, stock, stubProviders, totalUnits, type Command, type EconomyEvent, type Refused } from '../src/index.ts'

function setup() {
  const providers = stubProviders()
  const runner = new Runner(undefined, undefined, providers)
  runner.run({ type: 'defineGood', good: { id: 'grain', type: null, weight: 0.5, spoilagePerDay: null, legal: null } })
  runner.run({ type: 'openMarket', id: 'market', mode: 'abstract' })
  runner.run({ type: 'setMarketGood', market: 'market', good: 'grain', basePrice: 2 })
  const inventory = runner.run({ type: 'openInventory', holder: 'holder', market: 'market' }).minted!
  runner.run({ type: 'addStock', inventory: runner.state.markets.market.inventory, good: 'grain', units: 10 })
  runner.run({ type: 'addStock', inventory, good: 'grain', units: 5 })
  providers.ledger.balances = { holder: 100, market: 100 }
  return { runner, inventory, ledger: providers.ledger }
}

function outcome(events: EconomyEvent[]) {
  expect(events.filter(event => event.type === 'shared.action.outcome')).toHaveLength(1)
  const last = events.at(-1)!
  expect(last.type).toBe('shared.action.outcome')
  if (last.type !== 'shared.action.outcome') throw new Error('missing outcome')
  return last
}

function refused(fixture: ReturnType<typeof setup>, command: Command, fields: Omit<Refused, 'type' | 'cause'>) {
  const { runner, ledger } = fixture
  const before = JSON.stringify(runner.state)
  const balances = structuredClone(ledger.balances), log = structuredClone(ledger.log)
  const transfer = vi.spyOn(ledger, 'transfer')
  const result = runner.run(command)
  const payload = { type: 'refused', ...fields, cause: command.cause }
  expect(result.events).toEqual([payload, { type: 'shared.action.outcome', cause: command.cause, status: 'failed', stimuli: [fields], payload }])
  expect(outcome(result.events).payload).toBe(result.events[0])
  expect(JSON.stringify(runner.state)).toBe(before)
  expect(ledger.balances).toEqual(balances)
  expect(ledger.log).toEqual(log)
  expect(transfer).not.toHaveBeenCalled()
}

describe('O1 accepted trades complete and conserve goods and money', () => {
  it.each(['buy', 'sell'] as const)('%s ends with exactly one completed outcome', type => {
    const { runner, inventory, ledger } = setup()
    const result = runner.run({ type, inventory, good: 'grain', units: 3, cause: 'int.1' })
    const event = outcome(result.events)
    expect(result.events).toHaveLength(4)
    expect(event).toEqual({ type: 'shared.action.outcome', cause: 'int.1', status: 'completed',
      stimuli: [{ good: 'grain', units: 3, price: 2, amount: 6, market: 'market', inventory }], payload: result.events[2] })
    expect(event.payload).toBe(result.events[2])
    expect(event.payload.type).toBe(type === 'buy' ? 'bought' : 'sold')
    expect(result.events.every(row => row.cause === 'int.1')).toBe(true)
    expect(totalUnits(runner.state, 'grain')).toBe(15)
    expect(stock(runner.state, inventory, 'grain')).toBe(type === 'buy' ? 8 : 2)
    expect(marketStock(runner.state, 'market', 'grain')).toBe(type === 'buy' ? 7 : 13)
    expect(ledger.balances).toEqual(type === 'buy' ? { holder: 94, market: 106 } : { holder: 106, market: 94 })
    expect(ledger.log).toHaveLength(1)
  })
})

describe('O2 price limit refusals fail without effects', () => {
  it.each(['buy', 'sell'] as const)('%s includes the limit reason in stimuli', type => {
    const fixture = setup()
    refused(fixture, { type, inventory: fixture.inventory, good: 'grain', units: 3, cause: 'int.limit',
      ...(type === 'buy' ? { priceMax: 1 } : { priceMin: 3 }) },
    { command: type, reason: type === 'buy' ? 'price-above-limit' : 'price-below-limit', price: 2, limit: type === 'buy' ? 1 : 3 })
  })
})

describe('O3 no price fails only caused trades before stock checks', () => {
  it.each(['buy', 'sell'] as const)('%s refuses no price and preserves the legacy throw', type => {
    const fixture = setup()
    fixture.runner.run({ type: 'setMarketGood', market: 'market', good: 'grain', basePrice: null })
    const command = { type, inventory: fixture.inventory, good: 'grain', units: 20 }
    refused(fixture, { ...command, cause: 'int.price' }, { command: type, reason: 'no-price', price: null })
    expect(() => fixture.runner.run(command)).toThrow(/no price for grain/)
  })
})

describe('O4 beyond stock fails only caused trades before limit checks', () => {
  it.each(['buy', 'sell'] as const)('%s refuses excess stock and preserves the legacy throw', type => {
    const fixture = setup()
    const command = { type, inventory: fixture.inventory, good: 'grain', units: 11,
      ...(type === 'buy' ? { priceMax: 0 } : { priceMin: 3 }) }
    refused(fixture, { ...command, cause: 'int.stock' },
      { command: type, reason: 'beyond-stock', price: 2, units: 11, available: type === 'buy' ? 10 : 5 })
    expect(() => fixture.runner.run(command)).toThrow(type === 'buy' ? /market has 10/ : /have 5/)
  })
})

describe('O5 partial mass takes complete with actual kilograms', () => {
  it('reports the smaller takenKg and the caused stockChanged payload', () => {
    const { runner, inventory } = setup()
    const result = runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 10, cause: 'int.mass' })
    expect(result.takenKg).toBe(2.5)
    expect(result.events).toHaveLength(2)
    expect(outcome(result.events)).toEqual({ type: 'shared.action.outcome', cause: 'int.mass', status: 'completed',
      stimuli: [{ inventory, good: 'grain', kg: 2.5 }], payload: { type: 'stockChanged', inventory, good: 'grain', delta: -5, reason: 'takeMass', cause: 'int.mass' } })
    expect(stock(runner.state, inventory, 'grain')).toBe(0)
  })
})

describe('O6 empty mass takes fail only with cause', () => {
  it('leaves empty stock untouched and preserves uncaused zero result', () => {
    const fixture = setup()
    const command = { type: 'takeMass' as const, inventory: fixture.inventory, good: 'grain', kg: 10 }
    fixture.runner.run(command)
    refused(fixture, { ...command, cause: 'int.empty' }, { command: 'takeMass', reason: 'no-stock', price: null, units: 10, available: 0 })
    const result = fixture.runner.run(command)
    expect(result.takenKg).toBe(0)
    expect(result.events).toEqual([])
  })
})

describe('O7 outcomes are scoped to caused trades and mass withdrawals', () => {
  it('preserves uncaused trades and caused addMass event shapes', () => {
    const { runner, inventory } = setup()
    for (const type of ['buy', 'sell'] as const) {
      const result = runner.run({ type, inventory, good: 'grain', units: 1 })
      expect(result.events).toHaveLength(3)
      expect(result.events.every(event => !Object.hasOwn(event, 'cause') && event.type !== 'shared.action.outcome' && event.type !== 'refused')).toBe(true)
    }
    expect(runner.run({ type: 'addMass', inventory, good: 'grain', kg: 1, cause: 'int.add' }).events)
      .toEqual([{ type: 'stockChanged', inventory, good: 'grain', delta: 2, reason: 'addMass', cause: 'int.add' }])
    expect(runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 0, cause: 'int.zero' }).events).toEqual([])
  })
})

describe('O8 outcome logs replay identically (E3)', () => {
  it('replays accepted and refused trades and empty withdrawals', () => {
    const { runner, inventory } = setup()
    runner.run({ type: 'buy', inventory, good: 'grain', units: 3, cause: 'int.buy' })
    runner.run({ type: 'buy', inventory, good: 'grain', units: 3, priceMax: 1, cause: 'int.refused' })
    runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 10, cause: 'int.take' })
    runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 10, cause: 'int.empty' })
    const again = Runner.replay(runner.log)
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(runner.state))
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(runner.events))
  })
})

describe('O9 invalid caused input still throws atomically', () => {
  it('rejects invalid numbers, references, weights and empty causes before effects', () => {
    const { runner, inventory, ledger } = setup()
    for (const weight of [null, 0]) runner.run({ type: 'defineGood', good: { id: `weight-${weight}`, type: null, weight, spoilagePerDay: null, legal: null } })
    const commands: Command[] = []
    for (const type of ['buy', 'sell'] as const) {
      const base = { type, inventory, good: 'grain', units: 1, cause: 'int.bad' }
      commands.push({ ...base, units: 0 }, { ...base, inventory: 'missing' }, { ...base, good: 'missing' }, { ...base, cause: '' })
      for (const value of [-1, NaN, Infinity]) commands.push({ ...base, units: value }, { ...base, price: value },
        { ...base, ...(type === 'buy' ? { priceMax: value } : { priceMin: value }) })
    }
    for (const kg of [-1, NaN, Infinity]) commands.push({ type: 'takeMass', inventory, good: 'grain', kg, cause: 'int.bad' })
    for (const weight of [null, 0]) commands.push({ type: 'takeMass', inventory, good: `weight-${weight}`, kg: 1, cause: 'int.bad' })
    const before = JSON.stringify([runner.state, runner.log, runner.events])
    for (const command of commands) {
      expect(() => runner.run(command)).toThrow()
      expect(JSON.stringify([runner.state, runner.log, runner.events])).toBe(before)
    }
    expect(ledger.log).toEqual([])
    runner.run({ type: 'setMarketGood', market: 'market', good: 'grain', basePrice: null })
    expect(() => runner.run({ type: 'buy', inventory, good: 'grain', units: 1, priceMax: NaN, cause: 'int.bad' })).toThrow(/priceMax/)
    runner.state.inventories[inventory].market = 'missing'
    expect(() => runner.run({ type: 'buy', inventory, good: 'grain', units: 1, cause: 'int.bad' })).toThrow(/market/)
  })
})
