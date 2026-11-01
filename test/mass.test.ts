import { describe, expect, it } from 'vitest'
import { Runner, foodOf, massOf, stock, type Good, type TakeMass, type AddMass } from '../src/index.ts'

const good = (id: string, over: Partial<Good> = {}): Good => ({ id, type: null, weight: 0.5, spoilagePerDay: null, legal: null, ...over })

function setup() {
  const runner = new Runner()
  runner.run({ type: 'defineGood', good: good('grain', { food: 'life.grain' }) })
  runner.run({ type: 'openMarket', id: 'market', mode: 'settlement' })
  const inventory = runner.state.markets.market.inventory
  runner.run({ type: 'setMarketGood', market: 'market', good: 'grain', productionPerDay: 7, consumptionPerDay: 2, basePrice: 3 })
  runner.run({ type: 'addStock', inventory, good: 'grain', units: 10 })
  return { runner, inventory }
}

describe('M1 takeMass conserves kilograms at the source', () => {
  it('removes six half-kilogram units and reports exactly the three kilograms lost', () => {
    const { runner, inventory } = setup()
    const before = massOf(runner.state, 'grain', stock(runner.state, inventory, 'grain'))!
    const markets = structuredClone(runner.state.markets)
    const command: TakeMass = { type: 'takeMass', inventory, good: 'grain', kg: 3 }
    const result = runner.run(command)
    expect(result.takenKg).toBe(3)
    expect(result.taken).toBeNull()
    expect(stock(runner.state, inventory, 'grain')).toBe(4)
    expect(massOf(runner.state, 'grain', 4)! - before).toBe(-result.takenKg!)
    expect(result.events).toEqual([{ type: 'stockChanged', inventory, good: 'grain', delta: -6, reason: 'takeMass' }])
    expect(runner.state.markets).toEqual(markets)
  })
})

describe('M2 takeMass is capped by stock', () => {
  it('empties stock without a negative entry and reports its mass, then zero', () => {
    const { runner, inventory } = setup()
    expect(runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 20 }).takenKg).toBe(5)
    expect(stock(runner.state, inventory, 'grain')).toBe(0)
    expect(runner.state.inventories[inventory].stock).not.toHaveProperty('grain')
    expect(runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 1 }).takenKg).toBe(0)
  })
})

describe('M3 addMass and takeMass conserve a round trip', () => {
  it('adds four units for two kilograms and returns to the initial stock within 1e-12', () => {
    const { runner, inventory } = setup()
    const markets = structuredClone(runner.state.markets)
    const command: AddMass = { type: 'addMass', inventory, good: 'grain', kg: 2 }
    const result = runner.run(command)
    expect(stock(runner.state, inventory, 'grain')).toBe(14)
    expect(result).not.toHaveProperty('takenKg')
    expect(result.events).toEqual([{ type: 'stockChanged', inventory, good: 'grain', delta: 4, reason: 'addMass' }])
    expect(runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 2 }).takenKg).toBe(2)
    expect(Math.abs(stock(runner.state, inventory, 'grain') - 10)).toBeLessThanOrEqual(1e-12)
    expect(runner.state.markets).toEqual(markets)
    expect(runner.run({ type: 'take', inventory, good: 'grain', units: 0 })).not.toHaveProperty('takenKg')
  })
})

describe('M4 unknown or zero weight refuses mass transfers atomically', () => {
  it('leaves state and log untouched for both commands and both unusable weights', () => {
    const { runner, inventory } = setup()
    for (const weight of [null, 0]) {
      const id = `weight-${weight}`
      runner.run({ type: 'defineGood', good: good(id, { weight }) })
      expect(massOf(runner.state, id, 10)).toBe(weight === null ? null : 0)
      const before = JSON.stringify(runner.state), log = JSON.stringify(runner.log)
      for (const type of ['takeMass', 'addMass'] as const) {
        expect(() => runner.run({ type, inventory, good: id, kg: 1 })).toThrow(/weight/)
        expect(JSON.stringify(runner.state)).toBe(before)
        expect(JSON.stringify(runner.log)).toBe(log)
      }
    }
  })
})

describe('M5 kilograms must be finite and non-negative', () => {
  it('refuses negative and non-finite kilograms without changing state or log', () => {
    const { runner, inventory } = setup()
    const before = JSON.stringify(runner.state), log = JSON.stringify(runner.log)
    for (const type of ['takeMass', 'addMass'] as const) for (const kg of [-1, NaN, Infinity, -Infinity]) {
      expect(() => runner.run({ type, inventory, good: 'grain', kg })).toThrow(/kg/)
      expect(JSON.stringify(runner.state)).toBe(before)
      expect(JSON.stringify(runner.log)).toBe(log)
    }
  })
})

describe('M6 foodOf reads the optional Life mapping', () => {
  it('returns mapped ids or null and preserves the serialized shape of unmapped goods', () => {
    const { runner } = setup()
    const plain = good('plain')
    runner.run({ type: 'defineGood', good: plain })
    runner.run({ type: 'defineGood', good: good('null', { food: null }) })
    expect(foodOf(runner.state, 'grain')).toBe('life.grain')
    expect(foodOf(runner.state, 'plain')).toBeNull()
    expect(foodOf(runner.state, 'null')).toBeNull()
    expect(JSON.stringify(runner.state.goods.plain)).toBe(JSON.stringify(plain))
    expect(runner.state.goods.plain).not.toHaveProperty('food')
  })
})

describe('M7 mass transfer logs replay deterministically', () => {
  it('replays additions and withdrawals to byte-identical state', () => {
    const { runner, inventory } = setup()
    runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 3 })
    runner.run({ type: 'addMass', inventory, good: 'grain', kg: 2 })
    runner.run({ type: 'takeMass', inventory, good: 'grain', kg: 20 })
    expect(JSON.stringify(Runner.replay(runner.log).state)).toBe(JSON.stringify(runner.state))
  })
})

describe('M8 mass transfers require known inventories and goods', () => {
  it('refuses either unknown reference without changing state or log', () => {
    const { runner, inventory } = setup()
    const before = JSON.stringify(runner.state), log = JSON.stringify(runner.log)
    for (const type of ['takeMass', 'addMass'] as const) {
      expect(() => runner.run({ type, inventory: 'missing', good: 'grain', kg: 1 })).toThrow(/inventory/)
      expect(() => runner.run({ type, inventory, good: 'missing', kg: 1 })).toThrow(/good/)
      expect(JSON.stringify(runner.state)).toBe(before)
      expect(JSON.stringify(runner.log)).toBe(log)
    }
  })
})

describe('M9 a present food mapping must be a non-empty string or null', () => {
  it('refuses invalid mappings without changing state or log', () => {
    const { runner } = setup()
    const before = JSON.stringify(runner.state), log = JSON.stringify(runner.log)
    for (const food of ['', 1, false, undefined, {}]) {
      expect(() => runner.run({ type: 'defineGood', good: good('bad', { food } as Partial<Good>) })).toThrow(/food/)
      expect(JSON.stringify(runner.state)).toBe(before)
      expect(JSON.stringify(runner.log)).toBe(log)
    }
  })
})
