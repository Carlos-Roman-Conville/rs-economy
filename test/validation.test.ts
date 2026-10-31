// VALIDATION.md section 2: accounting identities and boundedness, not empirical calibration.
import { describe, expect, it } from 'vitest'
import { simulate, type SimResult } from '../examples/three-ports.ts'
import { Runner, assertPriceRule, defaultConfig, price, shortage, stubProviders,
  type Command, type EconomyConfig, type EconomyEvent, type EconomyState, type PriceRule } from '../src/index.ts'

const config = { ...defaultConfig(), priceRule: { kind: 'shortage-linear' as const, low: 0.7, high: 3 } }
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
function relative(actual: number, expected: number, label: string) {
  expect(Number.isFinite(actual), label).toBe(true)
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)))
}

function replay(result: SimResult, check: (runner: Runner, events: EconomyEvent[], command: Command,
  balances: Record<string, number>, startingMoney: number) => void, replayConfig: EconomyConfig = config) {
  const providers = stubProviders()
  providers.transport.set('port.north', 'port.east', 2)
  providers.transport.set('port.east', 'port.south', 3)
  providers.transport.set('port.north', 'port.south', 4)
  // These are the example host's only money injections; they are outside the engine command log.
  for (const company of result.companies) providers.ledger.balances[company] = 500
  const startingMoney = sum(Object.values(providers.ledger.balances))
  const runner = new Runner(undefined, replayConfig, providers)
  for (const command of result.log as Command[]) {
    providers.ledger.day = runner.state.day
    const { events } = runner.run(command)
    check(runner, events, command, providers.ledger.balances, startingMoney)
  }
  expect(runner.state.day).toBe(365)
  expect(runner.state).toEqual(result.state)
  expect(providers.ledger.balances).toEqual(result.balances)
  return runner
}

// Exhaustive over PriceRule: adding a rule requires declaring its independent bounds here.
const rules = {
  base: { kind: 'base' },
  'shortage-linear': { kind: 'shortage-linear', low: 0.7, high: 3 },
  'king-davenant-table': { kind: 'king-davenant-table', cap: 5.5 },
} satisfies Record<PriceRule['kind'], PriceRule>
function bounds(rule: PriceRule): [number, number] {
  switch (rule.kind) {
    case 'base': return [1, 1]
    case 'shortage-linear': return [rule.low, rule.high]
    case 'king-davenant-table': return [1, rule.cap]
    default: { const unhandled: never = rule; throw new Error(String(unhandled)) }
  }
}
function bounded(value: number | null, base: number, rule: PriceRule) {
  expect(value).not.toBeNull()
  expect(Number.isFinite(value)).toBe(true)
  const [low, high] = bounds(rule)
  expect(value!).toBeGreaterThanOrEqual(base * low)
  expect(value!).toBeLessThanOrEqual(base * high)
}

describe('V1 goods ledger', () => {
  it('V1 accounts for every good through 365 days, with transfers netting to zero', { timeout: 60_000 }, () => {
    const ledger: Record<string, { added: number; produced: number; consumed: number; spoiled: number }> = {}
    const reasons = new Set<string>()
    const previousTransit: Record<string, number> = {}
    const check = (runner: Runner, events: EconomyEvent[]) => {
      const transfers: Record<string, number> = {}
      for (const good of Object.keys(runner.state.goods)) ledger[good] ??= { added: 0, produced: 0, consumed: 0, spoiled: 0 }
      for (const event of events) {
        if (event.type === 'consumed') ledger[event.good].consumed += event.units
        if (event.type === 'spoiled') ledger[event.good].spoiled += event.units
        // Transit spoilage is a loss, not a transfer.
        if (event.type === 'spoiled' && runner.state.shipments[event.inventory]) {
          transfers[event.good] = (transfers[event.good] ?? 0) + event.units
        }
        if (event.type !== 'stockChanged') continue
        const { good, delta, reason } = event
        reasons.add(reason.split(':')[0])
        if (reason === 'add') ledger[good].added += delta
        else if (reason === 'abstract-production' || /^(produce|byproduct):/.test(reason)) ledger[good].produced += delta
        else if (/^(input|inputAny):/.test(reason)) ledger[good].consumed -= delta
        // Dedicated events count these losses once (including spoilage in transit).
        else if (reason === 'consumption' || reason === 'spoilage') continue
        else {
          expect(/^(move[<>]|ship:|arrive:|buy$|sell$)/.test(reason), reason).toBe(true)
          transfers[good] = (transfers[good] ?? 0) + delta
        }
      }
      for (const [good, entry] of Object.entries(ledger)) {
        const held = sum(Object.values(runner.state.inventories).map(inv => inv.stock[good] ?? 0))
        const transit = sum(Object.values(runner.state.shipments).filter(s => s.status === 'transit' && s.good === good).map(s => s.units))
        // Count shipping only from stock-change reasons, balanced against actual transit changes.
        relative((transfers[good] ?? 0) + transit - (previousTransit[good] ?? 0), 0, `${good} transfers`)
        previousTransit[good] = transit
        // Replay starts from empty state: start = 0; all seeded stocks are host additions.
        relative(held + transit + entry.consumed + entry.spoiled, entry.added + entry.produced, `${runner.state.day}/${good}`)
      }
    }
    const runner = replay(simulate(365), check)
    expect(Object.keys(ledger)).toEqual(['grain', 'timber', 'cloth'])
    for (const entry of Object.values(ledger)) {
      expect(entry.added).toBeGreaterThan(0)
      expect(entry.produced).toBeGreaterThan(0)
      expect(entry.consumed).toBeGreaterThan(0)
    }
    expect(ledger.grain.spoiled).toBeGreaterThan(0)
    for (const reason of ['buy', 'sell', 'ship', 'arrive', 'abstract-production']) expect(reasons.has(reason)).toBe(true)

    // The example has no recipes or direct moves. Exercise those accounting paths with explicit fixtures too.
    const inventory = runner.state.markets['port.north'].inventory
    const run = (command: Command) => check(runner, runner.run(command).events)
    run({ type: 'addStock', inventory, good: 'timber', units: 4 })
    run({ type: 'addStock', inventory, good: 'grain', units: 2 })
    run({ type: 'defineRecipe', recipe: { id: 'fixture.recipe', output: 'cloth', yield: 2,
      inputs: [{ good: 'timber', units: 4 }], inputsAny: [{ options: ['grain'], units: 2 }],
      byproducts: [{ good: 'timber', units: 0.5 }], equipment: [], skill: null, band: null,
      minLevel: null, knowledge: null, rates: { unitsPerFixtureDay: 1, labourHoursPerUnit: 0 } } })
    run({ type: 'produce', inventory, recipe: 'fixture.recipe', units: 1 })
    run({ type: 'moveStock', from: inventory, to: runner.state.markets['port.east'].inventory, good: 'cloth', units: 2 })
  })
})

describe('V2 money conservation', () => {
  it('V2 preserves the host starting purses after every command over 365 days', { timeout: 60_000 }, () => {
    let days = 0
    replay(simulate(365), (_runner, _events, command, balances, startingMoney) => {
      relative(sum(Object.values(balances)), startingMoney, 'total money')
      if (command.type === 'tick') days++
    })
    expect(days).toBe(365)
  })
})

describe('V3 price bounds', () => {
  it('V3 keeps each PriceRule finite and within its own bounds at shortage 0, .25, .5, .75 and 1', () => {
    for (const rule of Object.values(rules)) for (const base of [0, 2, 9]) for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const cfg = { ...defaultConfig(), priceRule: rule }
      const runner = new Runner(undefined, cfg)
      runner.run({ type: 'defineGood', good: { id: 'fixture', type: null, weight: null, spoilagePerDay: null, legal: null } })
      runner.run({ type: 'openMarket', id: 'market', mode: 'abstract' })
      runner.run({ type: 'setMarketGood', market: 'market', good: 'fixture', targetReserve: 100, basePrice: base })
      runner.run({ type: 'addStock', inventory: runner.state.markets.market.inventory, good: 'fixture', units: 100 * (1 - fraction) })
      expect(shortage(runner.state, 'market', 'fixture')).toBe(fraction)
      bounded(price(runner.state, cfg, 'market', 'fixture'), base, rule)
      runner.run({ type: 'tick' })
      bounded(runner.state.markets.market.goods.fixture.price, base, rule)
    }
  })
})

describe('V5 King-Davenant table', () => {
  // Independently transcribed from RESEARCH.md section 1 / ECON-DAV.
  // (0, 1): no deficit = the common rate (derived; not a printed row).
  const reference = [[0, 1], [0.1, 1.3], [0.2, 1.8], [0.3, 2.6], [0.4, 3.8], [0.5, 5.5]] as const
  function quote(fraction: number, cap = 5.5, base = 1) {
    const cfg = { ...defaultConfig(), priceRule: { kind: 'king-davenant-table' as const, cap } }
    const runner = new Runner(undefined, cfg)
    runner.run({ type: 'defineGood', good: { id: 'fixture', type: null, weight: null, spoilagePerDay: null, legal: null } })
    runner.run({ type: 'openMarket', id: 'market', mode: 'abstract' })
    runner.run({ type: 'setMarketGood', market: 'market', good: 'fixture', targetReserve: 100, basePrice: base })
    runner.run({ type: 'addStock', inventory: runner.state.markets.market.inventory, good: 'fixture', units: 100 * (1 - fraction) })
    return price(runner.state, cfg, 'market', 'fixture')!
  }

  it('V5 reproduces every period table row to 1e-12 and keeps the default base rule', () => {
    expect(defaultConfig().priceRule).toEqual({ kind: 'base' })
    expect(quote(0)).toBe(1)
    for (const [fraction, multiple] of reference) {
      expect(Math.abs(quote(fraction) - multiple)).toBeLessThanOrEqual(1e-12)
    }
  })

  it('V5 refuses king-davenant-table caps below 5.5 and NaN and accepts the floor', () => {
    const cfg = { ...defaultConfig(), priceRule: { kind: 'king-davenant-table' as const, cap: 5, } }
    const runner = new Runner()
    expect(() => price(runner.state, cfg, 'market', 'fixture')).toThrow('king-davenant-table cap 5 must be at least 5.5')
    const nanConfig = { ...defaultConfig(), priceRule: { kind: 'king-davenant-table' as const, cap: NaN } }
    expect(() => new Runner(undefined, nanConfig)).toThrow('king-davenant-table cap NaN must be at least 5.5')
    expect(() => price(runner.state, nanConfig, 'market', 'fixture')).toThrow('king-davenant-table cap NaN must be at least 5.5')
    expect(() => quote(0.5, 5.5)).not.toThrow()
    expect(quote(0.5, 5.5)).toBe(5.5)
  })

  it('V5 assertPriceRule refuses king-davenant-table caps 5 and NaN and accepts 5.5', () => {
    expect(() => assertPriceRule({ kind: 'king-davenant-table', cap: 5 })).toThrow('king-davenant-table cap 5 must be at least 5.5')
    expect(() => assertPriceRule({ kind: 'king-davenant-table', cap: NaN })).toThrow('king-davenant-table cap NaN must be at least 5.5')
    expect(() => assertPriceRule({ kind: 'king-davenant-table', cap: 5.5 })).not.toThrow()
  })

  it('V5 refuses cap 5 at Runner construction before the first tick or state changes', () => {
    const runner = new Runner()
    runner.run({ type: 'defineGood', good: { id: 'fixture', type: null, weight: null, spoilagePerDay: 0.1, legal: null } })
    runner.run({ type: 'openMarket', id: 'market', mode: 'abstract' })
    runner.run({ type: 'setMarketGood', market: 'market', good: 'fixture', productionPerDay: 10, consumptionPerDay: 2, basePrice: 1 })
    const before = structuredClone(runner.state)
    const cfg = { ...defaultConfig(), priceRule: { kind: 'king-davenant-table' as const, cap: 5 } }
    expect(() => new Runner(runner.state, cfg)).toThrow('king-davenant-table cap 5 must be at least 5.5')
    expect(runner.state).toEqual(before)
    expect(runner.state.day).toBe(0)
  })

  it('V5 interpolates linearly between rows and scales by base', () => {
    for (let i = 0; i < reference.length - 1; i++) {
      const [left, low] = reference[i]
      const [right, high] = reference[i + 1]
      expect(Math.abs(quote((left + right) / 2, 5.5, 2) - (low + high))).toBeLessThanOrEqual(1e-12)
    }
  })

  it('V5 is non-decreasing on a 0.01 grid and uses the configured cap from shortage 0.5', () => {
    let previous = quote(0)
    for (let i = 0; i <= 100; i++) {
      const current = quote(i / 100)
      expect(current).toBeGreaterThanOrEqual(previous)
      expect(current).toBeLessThanOrEqual(5.5)
      if (i >= 50) {
        expect(current).toBe(5.5)
        expect(quote(i / 100, 7, 2)).toBe(14)
      }
      previous = current
    }
  })
})

describe('V4 supply shock stability', () => {
  it.each(Object.values(rules))('V4 $kind stays finite, bounded and money-conserving during and after a 30-day halving of production', { timeout: 60_000 }, rule => {
    const config = { ...defaultConfig(), priceRule: rule }
    const result = simulate(365, config, { shock: { port: 'port.north', good: 'grain', fromDay: 60, toDay: 90, factor: 0.5 } })
    let days = 0
    replay(result, (runner, _events, command, balances, startingMoney) => {
      for (const balance of Object.values(balances)) expect(Number.isFinite(balance)).toBe(true)
      relative(sum(Object.values(balances)), startingMoney, 'shock money')
      if (command.type !== 'tick') return
      const day = runner.state.day - 1
      expect(runner.state.markets['port.north'].goods.grain.producedLast).toBe(day >= 60 && day < 90 ? 15 : 30)
      for (const market of Object.values(runner.state.markets)) for (const [good, entry] of Object.entries(market.goods)) {
        bounded(entry.price, entry.basePrice!, config.priceRule)
        bounded(price(runner.state, config, market.id, good), entry.basePrice!, config.priceRule)
      }
      days++
    }, config)
    expect(days).toBe(365)
    const state = result.state as EconomyState
    for (const row of result.rows) for (const [key, cell] of Object.entries(row.cells)) {
      const [port, good] = key.split('/')
      bounded(cell.price, state.markets[port].goods[good].basePrice!, config.priceRule)
    }
  })
})
