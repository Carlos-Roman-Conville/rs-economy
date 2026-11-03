import { describe, expect, it } from 'vitest'
import { Runner, stock, type Good } from '../src/index.ts'

// Fixture good: 0.5 kg per unit (not a game rule).
const fixtureGood = (id: string, over: Partial<Good> = {}): Good =>
  ({ id, type: null, weight: 0.5, spoilagePerDay: null, legal: null, ...over })

function baseRunner() {
  const runner = new Runner()
  runner.run({ type: 'defineGood', good: fixtureGood('fixture-good') })
  runner.run({ type: 'openMarket', id: 'fixture-market', mode: 'settlement' })
  return runner
}

describe('H1 opaque household holder opens inventory', () => {
  it('openInventory stores the fixture household holder string on the inventory record', () => {
    const runner = baseRunner()
    // Fixture HouseholdId `household:h1` (Society kind SOC-21); Economy does not assume Society's canonical string form.
    const holder = 'household:h1'
    const inventory = runner.run({ type: 'openInventory', holder, market: 'fixture-market' }).minted!
    expect(runner.state.inventories[inventory].holder).toBe(holder)
  })
})

describe('H2 mass take from household stock', () => {
  it('removes one half-kilogram unit and reports takenKg 0.5 when stock was four units', () => {
    const runner = baseRunner()
    const holder = 'household:h1'
    const inventory = runner.run({ type: 'openInventory', holder, market: 'fixture-market' }).minted!
    runner.run({ type: 'addStock', inventory, good: 'fixture-good', units: 4 })
    const result = runner.run({ type: 'takeMass', inventory, good: 'fixture-good', kg: 0.5 })
    expect(stock(runner.state, inventory, 'fixture-good')).toBe(3)
    expect(result.takenKg).toBe(0.5)
  })
})

describe('H3 holders do not share stock', () => {
  it('keeps household stock unchanged when mass is taken from a person inventory on the same market', () => {
    const runner = baseRunner()
    const personInventory = runner.run({ type: 'openInventory', holder: 'person:p1', market: 'fixture-market' }).minted!
    const householdInventory = runner.run({ type: 'openInventory', holder: 'household:h1', market: 'fixture-market' }).minted!
    runner.run({ type: 'addStock', inventory: personInventory, good: 'fixture-good', units: 4 })
    runner.run({ type: 'addStock', inventory: householdInventory, good: 'fixture-good', units: 4 })
    const beforeHousehold = stock(runner.state, householdInventory, 'fixture-good')
    runner.run({ type: 'takeMass', inventory: personInventory, good: 'fixture-good', kg: 0.5 })
    expect(stock(runner.state, householdInventory, 'fixture-good') - beforeHousehold).toBe(0)
  })
})

describe('H4 no access decision on household takeMass', () => {
  it('succeeds without authorisation input and emits no authorisation field on events', () => {
    const runner = baseRunner()
    const inventory = runner.run({ type: 'openInventory', holder: 'household:h1', market: 'fixture-market' }).minted!
    runner.run({ type: 'addStock', inventory, good: 'fixture-good', units: 2 })
    const result = runner.run({ type: 'takeMass', inventory, good: 'fixture-good', kg: 0.5 })
    expect(result.takenKg).toBe(0.5)
    for (const event of result.events) {
      expect(event).not.toHaveProperty('authorisation')
      expect(event).not.toHaveProperty('authorization')
    }
  })
})

describe('H5 household holder commands replay deterministically (E3)', () => {
  it('replays the same log to deep-equal state and events', () => {
    const runner = baseRunner()
    const inventory = runner.run({ type: 'openInventory', holder: 'household:h1', market: 'fixture-market' }).minted!
    runner.run({ type: 'addStock', inventory, good: 'fixture-good', units: 4 })
    runner.run({ type: 'takeMass', inventory, good: 'fixture-good', kg: 0.5 })
    runner.run({ type: 'takeMass', inventory, good: 'fixture-good', kg: 1 })
    const again = Runner.replay(runner.log)
    expect(again.state).toEqual(runner.state)
    expect(again.events).toEqual(runner.events)
  })
})
