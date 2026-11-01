import { describe, expect, it, vi } from 'vitest'
import { Runner, accounts, currencyProvider, price, stock, stubProviders } from '../src/index.ts'

function setup(currencies = true) {
  const p = stubProviders()
  const runner = new Runner(undefined, undefined, p)
  p.ledger.currencies = currencyProvider(() => runner.state)
  runner.run({ type: 'defineGood', good: { id: 'grain', type: null, weight: null, spoilagePerDay: null, legal: null } })
  runner.run({ type: 'openMarket', id: 'port', mode: 'abstract' })
  const stall = runner.state.markets.port.inventory
  const inv = runner.run({ type: 'openInventory', holder: 'trader', market: 'port' }).minted!
  runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', basePrice: 2, targetReserve: 40 })
  runner.run({ type: 'addStock', inventory: stall, good: 'grain', units: 20 })
  if (currencies) {
    runner.run({ type: 'defineCurrency', currency: { id: 'pieces' } })
    runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'pieces', basePrice: 7 })
  }
  return { runner, p, stall, inv }
}

for (const [i, side] of (['buy', 'sell'] as const).entries()) {
  describe(`Q${i + 1} ${side} in pieces conserves both assets`, () => {
    it('uses one exchange with the quoted pieces price and exact opposite deltas', () => {
      const { runner, p, stall, inv } = setup()
      if (side === 'sell') runner.run({ type: 'addStock', inventory: inv, good: 'grain', units: 3 })
      const exchange = vi.spyOn(p.ledger, 'exchange')
      const transfer = vi.spyOn(p.ledger, 'transfer')
      const result = runner.run({ type: side, inventory: inv, good: 'grain', units: 3, currency: 'pieces' })
      const sign = side === 'buy' ? 1 : -1
      expect(exchange).toHaveBeenCalledTimes(1)
      expect(transfer).not.toHaveBeenCalled()
      expect(exchange.mock.calls[0][0]).toEqual({ money: [{ from: side === 'buy' ? 'trader' : 'port',
        to: side === 'buy' ? 'port' : 'trader', currency: 'pieces', amount: 21 }],
      goods: [{ from: side === 'buy' ? stall : inv, to: side === 'buy' ? inv : stall, good: 'grain', units: 3 }] })
      expect(p.ledger.byCurrency).toEqual({ pieces: { trader: -sign * 21, port: sign * 21 } })
      expect(p.ledger.balances).toEqual({})
      expect(stock(runner.state, stall, 'grain')).toBe(20 - sign * 3)
      expect(stock(runner.state, inv, 'grain')).toBe(side === 'buy' ? 3 : 0)
      expect(p.ledger.log).toEqual([{ id: 'txn.0001', day: 0, kind: side === 'buy' ? 'purchase' : 'sale',
        from: side === 'buy' ? 'trader' : 'port', to: side === 'buy' ? 'port' : 'trader', subject: 'grain',
        amount: 21, authority: null, note: '3 @ 7', currency: 'pieces', batch: 'txn.0001' }])
      expect(result.events.at(-1)).toMatchObject({ type: side === 'buy' ? 'bought' : 'sold', price: 7, amount: 21, txn: 'txn.0001', currency: 'pieces' })
    })
  })
}

describe('Q3 shortage scales every currency by the same rule', () => {
  it('uses the same multiple for linear and table rules', () => {
    const { runner } = setup()
    for (const priceRule of [{ kind: 'shortage-linear' as const, low: 1, high: 3 }, { kind: 'king-davenant-table' as const, cap: 5.5 }]) {
      const config = { ...runner.config, priceRule }
      expect(price(runner.state, config, 'port', 'grain', 'pieces')! / 7).toBe(price(runner.state, config, 'port', 'grain')! / 2)
    }
  })
})

describe('Q4 unaccepted currency produces one failed outcome without movement', () => {
  it.each(['buy', 'sell'] as const)('records the refusing holder, currency and %s purpose even with a given price', side => {
    const { runner, p, inv } = setup()
    runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'pieces', basePrice: null })
    runner.state.inventories[runner.state.markets.port.inventory].holder = 'stall-owner'
    const before = JSON.stringify([runner.state, p.ledger])
    const exchange = vi.spyOn(p.ledger, 'exchange')
    const transfer = vi.spyOn(p.ledger, 'transfer')
    const fields = { command: side, reason: 'not-accepted', price: null, currency: 'pieces', market: 'port', refusedBy: 'stall-owner' }
    const refused = { type: 'refused', ...fields, cause: 'intent' }
    expect(runner.run({ type: side, inventory: inv, good: 'grain', units: 1, currency: 'pieces', price: 10, cause: 'intent' }).events)
      .toEqual([refused, { type: 'shared.action.outcome', cause: 'intent', status: 'failed', stimuli: [fields], payload: refused }])
    expect(JSON.stringify([runner.state, p.ledger])).toBe(before)
    expect(exchange).not.toHaveBeenCalled()
    expect(transfer).not.toHaveBeenCalled()
  })
})

describe('Q12 payment purpose describes only not-accepted refusals', () => {
  it.each([['buy', 'tax'], ['sell', 'debt']] as const)('%s carries %s into the single refusal and failed outcome', (type, purpose) => {
    const { runner, p, inv } = setup()
    runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'pieces', basePrice: null })
    const before = JSON.stringify([runner.state, p.ledger])
    const exchange = vi.spyOn(p.ledger, 'exchange')
    const transfer = vi.spyOn(p.ledger, 'transfer')
    const fields = { command: type, reason: 'not-accepted', price: null, currency: 'pieces', market: 'port', refusedBy: 'port', purpose }
    const refused = { type: 'refused', ...fields, cause: 'intent' }
    const result = runner.run({ type, inventory: inv, good: 'grain', units: 1, currency: 'pieces', cause: 'intent', purpose })
    expect(result.events).toEqual([refused, { type: 'shared.action.outcome', cause: 'intent', status: 'failed', stimuli: [fields], payload: refused }])
    expect(JSON.stringify([runner.state, p.ledger])).toBe(before)
    expect(exchange).not.toHaveBeenCalled()
    expect(transfer).not.toHaveBeenCalled()
  })

  it('omits purpose entirely and preserves refusal bytes for ordinary sales', () => {
    const { runner, inv } = setup()
    runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'pieces', basePrice: null })
    const fields = { command: 'buy', reason: 'not-accepted', price: null, currency: 'pieces', market: 'port', refusedBy: 'port' }
    const refused = { type: 'refused', ...fields, cause: 'intent' }
    const result = runner.run({ type: 'buy', inventory: inv, good: 'grain', units: 1, currency: 'pieces', cause: 'intent' })
    expect(result.events[0]).not.toHaveProperty('purpose')
    expect(JSON.stringify(result.events)).toBe(JSON.stringify([refused,
      { type: 'shared.action.outcome', cause: 'intent', status: 'failed', stimuli: [fields], payload: refused }]))
  })

  it('rejects invalid purposes before effects for both commands', () => {
    const { runner, p, inv } = setup()
    const before = JSON.stringify([runner.state, runner.log, runner.events, p.ledger])
    for (const type of ['buy', 'sell'] as const) {
      for (const purpose of ['', 'sale', null, 0, false, {}]) {
        // @ts-expect-error invalid host input must be checked at runtime
        expect(() => runner.run({ type, inventory: inv, good: 'grain', units: 1, purpose })).toThrow('purpose must be tax or debt')
      }
    }
    expect(JSON.stringify([runner.state, runner.log, runner.events, p.ledger])).toBe(before)
  })

  it('preserves accepted trades and other refusals byte for byte with either purpose', () => {
    for (const type of ['buy', 'sell'] as const) for (const currency of ['money', 'pieces']) {
      for (const purpose of ['tax', 'debt'] as const) for (const refused of [false, true]) {
        const run = (withPurpose: boolean) => {
          const { runner, p, inv } = setup()
          runner.run({ type: 'addStock', inventory: inv, good: 'grain', units: 1 })
          const result = runner.run({ type, inventory: inv, good: 'grain', units: refused ? 100 : 1,
            currency, cause: 'intent', ...(withPurpose ? { purpose } : {}) })
          return JSON.stringify([result, p.ledger])
        }
        expect(run(true)).toBe(run(false))
      }
    }
  })
})

describe('Q5 uncaused unaccepted currency throws', () => {
  it('requires a posted base even when the command gives a price', () => {
    const { runner, inv } = setup(false)
    runner.run({ type: 'defineCurrency', currency: { id: 'pieces' } })
    expect(price(runner.state, runner.config, 'port', 'grain', 'pieces')).toBeNull()
    expect(() => runner.run({ type: 'buy', inventory: inv, good: 'grain', units: 1, currency: 'pieces', price: 2 }))
      .toThrow('not accepted: pieces for grain in port')
  })
})

describe('Q6 unknown currencies throw without effects', () => {
  it('validates buy, sell and market quotes', () => {
    const { runner, p, inv } = setup()
    const before = JSON.stringify([runner.state, runner.log, runner.events, p.ledger])
    for (const type of ['buy', 'sell'] as const) expect(() => runner.run({ type, inventory: inv, good: 'grain', units: 1, currency: 'unknown', cause: 'intent' })).toThrow('unknown currency: unknown')
    expect(() => runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'unknown', basePrice: 1 })).toThrow('unknown currency: unknown')
    expect(JSON.stringify([runner.state, runner.log, runner.events, p.ledger])).toBe(before)
  })
})

describe('Q7 limits are in the offered currency', () => {
  it('refuses a pieces buy above its maximum and sell below its minimum', () => {
    const { runner, p, inv } = setup()
    runner.run({ type: 'addStock', inventory: inv, good: 'grain', units: 1 })
    const before = JSON.stringify([runner.state, p.ledger])
    expect(runner.run({ type: 'buy', inventory: inv, good: 'grain', units: 1, currency: 'pieces', priceMax: 6, cause: 'intent' }).events[0]).toMatchObject({ reason: 'price-above-limit', price: 7, limit: 6 })
    expect(runner.run({ type: 'sell', inventory: inv, good: 'grain', units: 1, currency: 'pieces', priceMin: 8, cause: 'intent' }).events[0]).toMatchObject({ reason: 'price-below-limit', price: 7, limit: 8 })
    expect(JSON.stringify([runner.state, p.ledger])).toBe(before)
  })
})

describe('Q8 accounting separates currency rows and inventory quotes', () => {
  it('keeps money totals unchanged and marks goods without a pieces quote unpriced', () => {
    const { runner, p, inv } = setup()
    runner.run({ type: 'buy', inventory: inv, good: 'grain', units: 3 })
    const money = accounts(runner.state, runner.config, p.ledger, 'trader', 0, 0)
    p.ledger.exchange({ money: [{ from: 'port', to: 'trader', currency: 'pieces', amount: 14 }] }, 'sale', 'grain')
    expect(accounts(runner.state, runner.config, p.ledger, 'trader', 0, 0)).toEqual(money)
    expect(money).not.toHaveProperty('currency')
    expect(accounts(runner.state, runner.config, p.ledger, 'trader', 0, 0, 'pieces')).toMatchObject({ currency: 'pieces', revenue: 14, purchases: 0, profit: 14, inventoryValue: 21, unpriced: [] })
    runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'pieces', basePrice: null })
    expect(accounts(runner.state, runner.config, p.ledger, 'trader', 0, 0, 'pieces')).toMatchObject({ inventoryValue: 0, unpriced: ['grain'] })
  })
})

describe('Q9 money preserves legacy state and event bytes', () => {
  it('matches the existing trade batch expectations without currency fields', () => {
    const { runner, p, inv, stall } = setup(false)
    const expected = structuredClone(runner.state)
    expected.inventories[stall].stock.grain = 17
    expected.inventories[inv].stock.grain = 3
    const result = runner.run({ type: 'buy', inventory: inv, good: 'grain', units: 3 })
    expect(JSON.stringify(result.state)).toBe(JSON.stringify(expected))
    expect(JSON.stringify(result.events)).toBe(JSON.stringify([
      { type: 'stockChanged', inventory: stall, good: 'grain', delta: -3, reason: 'buy' },
      { type: 'stockChanged', inventory: inv, good: 'grain', delta: 3, reason: 'buy' },
      { type: 'bought', inventory: inv, market: 'port', good: 'grain', units: 3, price: 2, amount: 6, txn: 'txn.0001' },
    ]))
    expect(p.ledger.log).toEqual([{ id: 'txn.0001', day: 0, kind: 'purchase', from: 'trader', to: 'port', subject: 'grain', amount: 6, authority: null, note: '3 @ 2' }])
  })
})

describe('Q10 currency quotes change only their base price', () => {
  it('rejects other fields and invalid prices, supports opaque currency ids and zero quotes', () => {
    const { runner } = setup()
    for (const field of ['consumptionPerDay', 'targetReserve', 'productionPerDay', 'perCapitaPerDay']) {
      expect(() => runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'pieces', [field]: null })).toThrow(/only basePrice/)
    }
    for (const basePrice of [-1, NaN, Infinity]) expect(() => runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: 'pieces', basePrice })).toThrow()
    runner.run({ type: 'defineCurrency', currency: { id: '__proto__' } })
    expect(price(runner.state, runner.config, 'port', 'grain', '__proto__')).toBeNull()
    runner.run({ type: 'setMarketGood', market: 'port', good: 'grain', currency: '__proto__', basePrice: 0 })
    expect(price(runner.state, runner.config, 'port', 'grain', '__proto__')).toBe(0)
    expect(runner.state.markets.port.goods.grain).toMatchObject({ basePrice: 2, targetReserve: 40, basePrices: { pieces: 7 } })
  })
})

describe('Q11 self trades omit goods and missing exchange throws', () => {
  it('retains self stock events and requires the exchange seam', () => {
    const { runner, p, inv, stall } = setup()
    const spy = vi.spyOn(p.ledger, 'exchange')
    runner.run({ type: 'buy', inventory: stall, good: 'grain', units: 3, currency: 'pieces' })
    expect(spy.mock.calls[0][0]).not.toHaveProperty('goods')
    expect(spy.mock.calls[0][4]).toBeUndefined()
    expect(stock(runner.state, stall, 'grain')).toBe(20)
    runner.providers.ledger = { balance: p.ledger.balance.bind(p.ledger), transfer: p.ledger.transfer.bind(p.ledger), rows: p.ledger.rows.bind(p.ledger) }
    expect(() => runner.run({ type: 'buy', inventory: inv, good: 'grain', units: 3, currency: 'pieces' })).toThrow('ledger provider has no exchange (CONTRACTS §22)')
  })
})
