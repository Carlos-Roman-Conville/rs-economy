import { describe, expect, it } from 'vitest'
import { transaction, type Participant } from '@rex/kernel'
import {
  World, defaultRegistry, stockPools, eatMeal, foodRow, foodContent, absorbedFraction, KCAL_J,
  type Component, type MealItem,
} from '@rex/realism'
import { snapshotWorld } from '../../realism/src/snapshot.ts'
import { Runner, foodOf, massOf, stock } from '../src/index.ts'

const food = foodRow('limes')
const options = { gutFunction: 0.5 } // Exercise nonzero unabsorbed energy too.
const mealContext = (kg: number) => ({
  ...options, vitCMg: foodContent(food, 'vit_c', kg), fatG: foodContent(food, 'fat', kg),
  flux: false, chronicFlux: false, rum: false,
})

function setup() {
  const world = new World(defaultRegistry())
  const body: Component = {
    id: 'body', kind: 'body', material: 'flesh', mass: 70, temperatureC: 37,
    contents: [{ substance: 'water', phase: 'liquid', mass: 40 }],
    ports: [], condition: { capability: 1, control: 1, accuracy: 1 },
    props: { area_m2: 1.9, h: 10 },
  }
  world.registry.addComponent(body)
  stockPools(world, body.id)
  const runner = new Runner()
  runner.run({ type: 'defineGood', good: {
    id: 'fruit', type: null, weight: 0.5, food: food.slug, spoilagePerDay: null, legal: null,
  } })
  runner.run({ type: 'openMarket', id: 'market', mode: 'settlement' })
  const inventory = runner.state.markets.market.inventory
  runner.run({ type: 'addStock', inventory, good: 'fruit', units: 4 })

  const saveEconomy = () => ({ state: structuredClone(runner.state), log: runner.log.length, events: runner.events.length })
  const economy: Participant = {
    id: 'economy', snapshot: saveEconomy,
    restore(value) {
      const saved = value as ReturnType<typeof saveEconomy>
      runner.state = saved.state
      runner.log.length = saved.log
      runner.events.length = saved.events
    },
  }
  // snapshotWorld has no restore counterpart (it is a comparison snapshot). Clone
  // all mutable state touched by eatMeal: components and trace data. No scheduler,
  // ledger folding or trace folding runs here, so their private carries stay untouched.
  const saveLife = () => structuredClone({ components: world.registry.components, trace: {
    transfers: world.trace.transfers, checks: world.trace.checks, notes: world.trace.notes,
    records: world.trace.records, checkSummaries: world.trace.checkSummaries, noteSummaries: world.trace.noteSummaries,
  } })
  const life: Participant = {
    id: 'life', snapshot: saveLife,
    restore(value) {
      const saved = value as ReturnType<typeof saveLife>
      world.registry.components.clear()
      for (const [id, component] of saved.components) world.registry.components.set(id, component)
      Object.assign(world.trace, saved.trace)
    },
  }
  const participants = [economy, life]
  function feed(kg: number, bodyId = 'body') {
    const before = structuredClone(world.registry.component('body'))
    const result = runner.run({ type: 'takeMass', inventory, good: 'fruit', kg })
    expect(world.registry.component('body')).toEqual(before)
    const item: MealItem = { food: foodOf(runner.state, 'fruit')!, kg: result.takenKg! }
    eatMeal(world, bodyId, [item], options)
    return { takenKg: result.takenKg!, item }
  }
  const inventoryMass = () => massOf(runner.state, 'fruit', stock(runner.state, inventory, 'fruit'))!
  return { runner, world, inventory, participants, feed, inventoryMass }
}

describe('F1 inventory mass is the meal mass', () => {
  it('passes exactly takenKg to eatMeal and removes exactly that mass', () => {
    const x = setup(), before = x.inventoryMass()
    const { takenKg, item } = transaction(x.participants, () => x.feed(0.5))
    expect(takenKg).toBe(0.5)
    expect(item).toEqual({ food: food.slug, kg: takenKg })
    expect(x.inventoryMass() - before).toBe(-takenKg)
  })
})

describe('F2 Life accounts for kept and wasted food energy', () => {
  it('balances intake and Life trace energy against the food table within 1e-9 J', () => {
    const x = setup(), before = x.world.registry.component('body').props.intake_kcal ?? 0
    const traceStart = x.world.trace.transfers.length
    const { takenKg } = transaction(x.participants, () => x.feed(0.5))
    const gross = takenKg * food.kcalPerKg
    const kept = x.world.registry.component('body').props.intake_kcal - before
    expect(Math.abs(kept - gross * absorbedFraction('energy', food, mealContext(takenKg)))).toBeLessThanOrEqual(1e-9)
    const energy = x.world.trace.transfers.slice(traceStart).filter(t => t.quantity === 'energy:chemical' && t.from === 'food')
    const wasteJ = energy.filter(t => t.to === 'waste').reduce((sum, t) => sum + t.amount, 0)
    const keptJ = energy.filter(t => t.to === 'body').reduce((sum, t) => sum + t.amount, 0)
    expect(wasteJ).toBeGreaterThan(0)
    expect(Math.abs(wasteJ - (gross - kept) * KCAL_J)).toBeLessThanOrEqual(1e-9)
    expect(Math.abs(keptJ - kept * KCAL_J)).toBeLessThanOrEqual(1e-9)
    expect(Math.abs(keptJ + wasteJ - gross * KCAL_J)).toBeLessThanOrEqual(1e-9)
  })
})

describe('F3 only eatMeal delivers water and nutrients', () => {
  it('adds table-derived water and vitamin C through Life with no other body writes', () => {
    const x = setup()
    const waterBefore = x.world.massOf('water', ['body'])
    const vitaminBefore = x.world.massOf('nutrient:vit_c', ['body'])
    const { takenKg } = transaction(x.participants, () => x.feed(0.5))
    const water = foodContent(food, 'water', takenKg) * absorbedFraction('water', food, mealContext(takenKg)) / 1000
    const vitamin = foodContent(food, 'vit_c', takenKg) * absorbedFraction('vit_c', food, mealContext(takenKg)) / 1e6
    expect(water).toBeGreaterThan(0)
    expect(vitamin).toBeGreaterThan(0)
    expect(x.world.massOf('water', ['body']) - waterBefore).toBeCloseTo(water, 12)
    expect(x.world.massOf('nutrient:vit_c', ['body']) - vitaminBefore).toBeCloseTo(vitamin, 12)
    expect(x.world.trace.transfers).toContainEqual(expect.objectContaining({
      from: 'food', to: 'body', quantity: 'mass:nutrient:vit_c', amount: vitamin,
    }))
  })
})

describe('F4 meals are capped by available stock', () => {
  it('eats the whole stock mass rather than an oversized request', () => {
    const x = setup(), available = x.inventoryMass()
    const { takenKg, item } = transaction(x.participants, () => x.feed(20))
    expect(takenKg).toBe(available)
    expect(item.kg).toBe(available)
    expect(x.inventoryMass()).toBe(0)
    expect(x.world.registry.component('body').props.intake_kcal).toBe(
      available * food.kcalPerKg * absorbedFraction('energy', food, mealContext(available)),
    )
  })
})

describe('F5 a failed meal rolls back both engines', () => {
  it('restores stock, state, log, events and Life after an earlier meal and a forced failure', () => {
    const x = setup()
    // Seed a committed meal so restoration must preserve existing traces and intake.
    transaction(x.participants, () => x.feed(0.5))
    const economyBefore = structuredClone({ state: x.runner.state, log: x.runner.log, events: x.runner.events })
    const lifeBefore = snapshotWorld(x.world)
    const stockBefore = stock(x.runner.state, x.inventory, 'fruit')
    expect(() => transaction(x.participants, () => {
      x.feed(0.5) // Mutate Life too; an unknown body alone would fail before doing so.
      x.feed(0.5, 'missing-body')
    })).toThrow(/missing-body/)
    expect(stock(x.runner.state, x.inventory, 'fruit')).toBe(stockBefore)
    expect({ state: x.runner.state, log: x.runner.log, events: x.runner.events }).toEqual(economyBefore)
    expect(snapshotWorld(x.world)).toEqual(lifeBefore)
  })
})
