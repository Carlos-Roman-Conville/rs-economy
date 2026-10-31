// One describe per TESTS.md E-row. Every number here is a fixture, not a game rule.
import { describe, expect, it } from 'vitest'

// Node's fs and path without @types/node (the realism precedent): the tests run under Node, the engine never needs them.
interface Fs { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string; statSync(p: string): { isDirectory(): boolean } }
interface Path { join(...parts: string[]): string }
const builtin = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule
const { readdirSync, readFileSync, statSync } = builtin('node:fs') as Fs
const { join } = builtin('node:path') as Path
import { Runner, availableUnits, defaultConfig, inventoryValue, materialProvider, price, producedLast, shortage, stock, type Command, type Good, type Recipe } from '../src/index.ts'

const good = (id: string, over: Partial<Good> = {}): Good => ({ id, type: null, weight: null, spoilagePerDay: null, legal: null, ...over })
const recipe = (id: string, over: Partial<Recipe>): Recipe => ({
  id, output: null, yield: 1, inputs: [], inputsAny: [], byproducts: [], equipment: [], skill: null, band: null, minLevel: null,
  knowledge: null, rates: { unitsPerFixtureDay: 1, labourHoursPerUnit: 10 }, ...over,
})

/** A hamlet with no game data: three goods, a plank recipe (one log -> two planks and sawdust), a yarn recipe that
 *  takes either fibre, a market and a sawyer's inventory. */
function hamlet(): { runner: Runner; sawyer: string } {
  const runner = new Runner()
  for (const id of ['log', 'plank', 'sawdust', 'flax', 'hemp', 'yarn']) runner.run({ type: 'defineGood', good: good(id) })
  runner.run({ type: 'defineRecipe', recipe: recipe('saw', { output: 'plank', yield: 2, inputs: [{ good: 'log', units: 1 }], byproducts: [{ good: 'sawdust', units: 0.5 }], rates: { unitsPerFixtureDay: 10, labourHoursPerUnit: 2.5 } }) })
  runner.run({ type: 'defineRecipe', recipe: recipe('spin', { output: 'yarn', yield: 1, inputsAny: [{ options: ['flax', 'hemp'], units: 2 }] }) })
  runner.run({ type: 'defineRecipe', recipe: recipe('gather', { output: 'log', yield: 1 }) })
  runner.run({ type: 'openMarket', id: 'stl.hamlet', mode: 'settlement' })
  const sawyer = runner.run({ type: 'openInventory', holder: 'sawyer', market: 'stl.hamlet' }).minted!
  runner.run({ type: 'addStock', inventory: sawyer, good: 'log', units: 5 })
  runner.run({ type: 'addStock', inventory: sawyer, good: 'flax', units: 3 })
  runner.run({ type: 'addStock', inventory: sawyer, good: 'hemp', units: 3 })
  return { runner, sawyer }
}

describe('E1 stock never goes negative', () => {
  it('refuses a move, a removal or a production beyond stock and leaves the state untouched', () => {
    const { runner, sawyer } = hamlet()
    const market = runner.state.markets['stl.hamlet'].inventory
    const before = structuredClone(runner.state)
    expect(() => runner.run({ type: 'moveStock', from: sawyer, to: market, good: 'log', units: 6 })).toThrow(/cannot move/)
    expect(() => runner.run({ type: 'removeStock', inventory: sawyer, good: 'log', units: 5.5 })).toThrow(/cannot remove/)
    expect(() => runner.run({ type: 'produce', inventory: sawyer, recipe: 'saw', units: 6 })).toThrow(/inputs allow 5/)
    expect(runner.state).toEqual(before)
  })
  it('take gives at most the stock and reports what it took', () => {
    const { runner, sawyer } = hamlet()
    expect(runner.run({ type: 'take', inventory: sawyer, good: 'log', units: 8 }).taken).toBe(5)
    expect(stock(runner.state, sawyer, 'log')).toBe(0)
    expect(runner.run({ type: 'take', inventory: sawyer, good: 'log', units: 1 }).taken).toBe(0)
    for (const inv of Object.values(runner.state.inventories)) for (const units of Object.values(inv.stock)) expect(units).toBeGreaterThan(0)
  })
})

describe('E2 produce consumes inputs by the recipe and yields output and by-products', () => {
  it('one log makes two planks and half a unit of sawdust; the market records the day\'s production', () => {
    const { runner, sawyer } = hamlet()
    expect(availableUnits(runner.state, sawyer, 'saw')).toBe(5)
    runner.run({ type: 'produce', inventory: sawyer, recipe: 'saw', units: 3 })
    expect(stock(runner.state, sawyer, 'log')).toBe(2)
    expect(stock(runner.state, sawyer, 'plank')).toBe(6)
    expect(stock(runner.state, sawyer, 'sawdust')).toBe(1.5)
    expect(runner.state.markets['stl.hamlet'].goods.plank.producedToday).toBe(6)
    runner.run({ type: 'tick' })
    expect(producedLast(runner.state, 'stl.hamlet', 'plank')).toBe(6)
    expect(runner.state.markets['stl.hamlet'].goods.plank.producedToday).toBe(0)
    expect(runner.state.day).toBe(1)
  })
  it('an inputsAny group pools its options and draws the first available first (proposed)', () => {
    const { runner, sawyer } = hamlet()
    expect(availableUnits(runner.state, sawyer, 'spin')).toBe(3)          // 6 fibre over 2 per unit
    runner.run({ type: 'produce', inventory: sawyer, recipe: 'spin', units: 2 })
    expect(stock(runner.state, sawyer, 'flax')).toBe(0)
    expect(stock(runner.state, sawyer, 'hemp')).toBe(2)
    expect(stock(runner.state, sawyer, 'yarn')).toBe(2)
  })
  it('a recipe with no inputs is unlimited by materials; units must be a positive integer', () => {
    const { runner, sawyer } = hamlet()
    expect(availableUnits(runner.state, sawyer, 'gather')).toBe(Number.POSITIVE_INFINITY)
    expect(() => runner.run({ type: 'produce', inventory: sawyer, recipe: 'gather', units: 0 })).toThrow(/units/)
    expect(() => runner.run({ type: 'produce', inventory: sawyer, recipe: 'gather', units: 1.5 })).toThrow(/integer/)
    runner.run({ type: 'produce', inventory: sawyer, recipe: 'gather', units: 4 })
    expect(stock(runner.state, sawyer, 'log')).toBe(9)
  })
  it('the MaterialProvider over a Runner has Settlement\'s shape and logs every call', () => {
    const { runner, sawyer } = hamlet()
    const materials = materialProvider(runner)
    const logged = runner.log.length
    expect(materials.rates('saw')).toEqual({ unitsPerFixtureDay: 10, labourHoursPerUnit: 2.5 })
    expect(materials.available(sawyer, 'saw')).toBe(5)
    materials.produce(sawyer, 'saw', 2)
    expect(materials.have(sawyer, 'plank')).toBe(4)
    expect(materials.take(sawyer, 'plank', 10)).toBe(4)
    expect(materials.have(sawyer, 'plank')).toBe(0)
    expect(runner.log.length).toBe(logged + 2)
  })
})

describe('E2b a recipe in worker-days is refused; person-hours pass through', () => {
  it('refuses worker-days even alongside person-hours and leaves state and log untouched', () => {
    const runner = new Runner()
    const before = JSON.stringify(runner.state)
    const log = JSON.stringify(runner.log)
    for (const rates of [
      { unitsPerFixtureDay: 1, labourPerUnit: 0.25 },
      { unitsPerFixtureDay: 1, labourPerUnit: 0.25, labourHoursPerUnit: 2.5 },
      { unitsPerFixtureDay: 1, labourPerUnit: undefined, labourHoursPerUnit: 2.5 },
    ]) {
      expect(() => runner.run({ type: 'defineRecipe', recipe: recipe('old', { rates: rates as Recipe['rates'] }) })).toThrow('labourPerUnit was replaced by labourHoursPerUnit, CONTRACTS §16')
      expect(() => runner.run({ type: 'defineRecipe', recipe: recipe('old', { rates: rates as Recipe['rates'] }) })).toThrow('§16')
      expect(JSON.stringify(runner.state)).toBe(before)
      expect(JSON.stringify(runner.log)).toBe(log)
    }
  })
  it('person-hours pass through including zero without changing stored state or the log', () => {
    const runner = new Runner()
    for (const hours of [2.5, 0]) {
      const def = recipe(`hours-${hours}`, { rates: { unitsPerFixtureDay: 4, labourHoursPerUnit: hours } })
      runner.run({ type: 'defineRecipe', recipe: def })
      const before = JSON.stringify(runner.state)
      const log = JSON.stringify(runner.log)
      const materials = materialProvider(runner)
      expect(materials.rates(def.id)).toEqual(def.rates)
      const returnedRates = materials.rates(def.id)
      returnedRates.labourHoursPerUnit = 999
      expect(materials.rates(def.id)).toEqual(def.rates)
      expect(JSON.stringify(runner.state.recipes[def.id])).toBe(JSON.stringify(def))
      expect(JSON.stringify(runner.state)).toBe(before)
      expect(JSON.stringify(runner.log)).toBe(log)
    }
  })
  it('requires finite non-negative person-hours', () => {
    const runner = new Runner()
    const before = JSON.stringify(runner.state)
    for (const hours of [undefined, -1, Infinity, -Infinity, NaN]) {
      const rates = { unitsPerFixtureDay: 1, labourHoursPerUnit: hours } as Recipe['rates']
      expect(() => runner.run({ type: 'defineRecipe', recipe: recipe('bad', { rates }) })).toThrow(/rates.labourHoursPerUnit/)
      expect(JSON.stringify(runner.state)).toBe(before)
    }
  })
})

describe('E3 replaying the command log gives the same state', () => {
  it('a day of production, moves and a tick replays byte for byte', () => {
    const { runner, sawyer } = hamlet()
    const market = runner.state.markets['stl.hamlet'].inventory
    runner.run({ type: 'setMarketGood', market: 'stl.hamlet', good: 'plank', basePrice: 2, targetReserve: 10 })
    runner.run({ type: 'produce', inventory: sawyer, recipe: 'saw', units: 2 })
    runner.run({ type: 'moveStock', from: sawyer, to: market, good: 'plank', units: 3 })
    runner.run({ type: 'take', inventory: sawyer, good: 'sawdust', units: 1 })
    runner.run({ type: 'tick' })
    const again = Runner.replay(runner.log)
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(runner.state))
    expect(again.state.inventories[sawyer].id).toBe('inv.0002')
  })
  it('prices and shortage read from the five numbers; unset numbers read null, never a default', () => {
    const { runner } = hamlet()
    const config = defaultConfig()
    expect(price(runner.state, config, 'stl.hamlet', 'plank')).toBeNull()
    expect(shortage(runner.state, 'stl.hamlet', 'plank')).toBeNull()
    runner.run({ type: 'setMarketGood', market: 'stl.hamlet', good: 'plank', basePrice: 2, targetReserve: 10 })
    expect(price(runner.state, config, 'stl.hamlet', 'plank')).toBe(2)          // rule 'base': the open state
    expect(shortage(runner.state, 'stl.hamlet', 'plank')).toBe(1)
    const curve = { ...config, priceRule: { kind: 'shortage-linear' as const, low: 0.5, high: 2 } }
    expect(price(runner.state, curve, 'stl.hamlet', 'plank')).toBe(4)
    const market = runner.state.markets['stl.hamlet'].inventory
    runner.run({ type: 'addStock', inventory: market, good: 'plank', units: 5 })
    expect(shortage(runner.state, 'stl.hamlet', 'plank')).toBe(0.5)
    expect(inventoryValue(runner.state, config, market)).toEqual({ value: 10, unpriced: [] })
  })
})

describe('E4 the engine imports nothing from outside the package', () => {
  it('every import in src/ is relative and stays inside src/', () => {
    const root = join(decodeURIComponent(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')))
    const files: string[] = []
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
    walk(root)
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/from\s+'([^']+)'/g)) {
        const spec = match[1]
        if (spec === '@rex/kernel') continue   // the one package dependency (ADOPTION.md 2601)
        expect(spec, `${file} imports ${spec}`).toMatch(/^\.\.?\//)
        expect(spec, `${file} leaves src/`).not.toMatch(/^\.\.\/\.\.\//)
        expect(spec).not.toMatch(/settlement|realism|pirate/)
      }
    }
  })
  it('the command union is the whole surface: an unknown command throws', () => {
    const runner = new Runner()
    expect(() => runner.run({ type: 'nope' } as unknown as Command)).toThrow(/unknown command/)
  })
})

describe('E17 the labour interface matches CONTRACTS section 16 verbatim', () => {
  it('contains the contract TypeScript block with only its two-space list indent removed', () => {
    const root = decodeURIComponent(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    const contract = readFileSync(join(root, 'CONTRACTS.md'), 'utf8')
    const section = contract.split(/^## 16\..*$/m)[1]?.split(/^## /m)[0]
    expect(section).toBeDefined()
    const block = section?.match(/^  ```ts\r?\n([\s\S]*?)^  ```/m)?.[1]
    expect(block).toBeDefined()
    expect(readFileSync(join(root, 'src', 'providers.ts'), 'utf8')).toContain(block!.replace(/^  /gm, ''))
  })
})
