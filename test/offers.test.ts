import { describe, expect, it, vi } from 'vitest'
// Node's fs and path without @types/node (the realism precedent): the tests run under Node, the engine never needs them.
interface Fs { readdirSync(p: string): string[]; readFileSync(p: string, enc: string): string; statSync(p: string): { isDirectory(): boolean } }
interface Path { join(...parts: string[]): string }
const builtin = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule
const { readdirSync, readFileSync, statSync } = builtin('node:fs') as Fs
const { join } = builtin('node:path') as Path
import { Runner, currencyProvider, mediaInUse, ratios, stock, stubProviders } from '../src/index.ts'
import type { Asset, AssetUnits } from '../src/index.ts'
import { simulate } from '../examples/three-ports.ts'

const fish: Asset = { good: 'fish' }, timber: Asset = { good: 'timber' }
const pieces: Asset = { currency: 'pieces' }, money: Asset = { currency: 'money' }
const q = (asset: Asset, units: number): AssetUnits => ({ asset, units })
function setup() {
  const p = stubProviders(), r = new Runner(undefined, undefined, p)
  p.ledger.currencies = currencyProvider(() => r.state)
  for (const id of ['fish', 'timber', 'gold']) r.run({ type: 'defineGood', good: { id, type: null, weight: null, spoilagePerDay: null, legal: null } })
  r.run({ type: 'defineCurrency', currency: { id: 'pieces' } })
  r.run({ type: 'openMarket', id: 'port', mode: 'abstract' })
  const inv: Record<string, string> = {}
  for (const by of ['a', 'b', 'c', 'd']) {
    inv[by] = r.run({ type: 'openInventory', holder: by, market: 'port' }).minted!
    for (const good of ['fish', 'timber', 'gold']) r.run({ type: 'addStock', inventory: inv[by], good, units: 100 })
  }
  const post = (by: string, give = q(fish, 10), want = q(timber, 20), expires?: number) =>
    r.run({ type: 'offer', market: 'port', by, inventory: inv[by], give, want, expires })
  const accept = (offer: string, units?: number) => r.run({ type: 'accept', offer, by: 'b', inventory: inv.b, units })
  return { r, p, inv, post, accept }
}

describe('M1 crossing barter conserves each asset', () => {
  it('makes one atomic provider call per fill and exact opposite deltas', () => {
    const { r, p, inv, post } = setup(), spy = vi.spyOn(p.ledger, 'exchange')
    const id = post('a').minted!
    post('b', q(timber, 20), q(fish, 10))
    expect(spy).toHaveBeenCalledTimes(1)
    expect([stock(r.state, inv.a, 'fish'), stock(r.state, inv.b, 'fish')]).toEqual([90, 110])
    expect([stock(r.state, inv.a, 'timber'), stock(r.state, inv.b, 'timber')]).toEqual([120, 80])
    expect(r.state.trades).toEqual([{ day: 0, market: 'port', offer: id, maker: 'a', taker: 'b', gave: q(fish, 10), got: q(timber, 20) }])
    expect(p.ledger.log).toEqual([])
  })
})
describe('M2 resting price', () => {
  it('charges the earlier ratio and rests the unspent generous remainder', () => {
    const { r, post } = setup()
    post('a'); post('b', q(timber, 30), q(fish, 10))
    expect(r.state.trades![0].got.units).toBe(20)
    expect(r.state.markets.port.offers![0].remaining).toBe(10)
  })
})
describe('M3 price-time priority', () => {
  it('serves lowest resting ratio then earliest equal-price offer', () => {
    const { r, post } = setup()
    const expensive = post('a', q(fish, 2), q(timber, 4)).minted!
    const first = post('c', q(fish, 2), q(timber, 2)).minted!
    const second = post('d', q(fish, 2), q(timber, 2)).minted!
    post('b', q(timber, 12), q(fish, 6))
    expect(r.state.trades!.map(t => t.offer)).toEqual([first, second, expensive])
  })
})
describe('M4 partial fills', () => {
  it('rests incoming remainder and consumes it later', () => {
    const { r, post } = setup()
    post('a', q(fish, 2), q(timber, 4))
    const incoming = post('b', q(timber, 10), q(fish, 5)).minted!
    expect(r.state.markets.port.offers![0].remaining).toBe(6)
    post('c', q(fish, 3), q(timber, 6))
    expect(r.state.markets.port.offers).toEqual([])
    expect(r.state.trades![1].offer).toBe(incoming)
  })
})
describe('M5 currency fills', () => {
  it('exchanges goods and currencies with batch rows, conserving balances without a cap', () => {
    const { r, p, inv, post, accept } = setup()
    accept(post('a', q({ good: 'gold' }, 2), q(pieces, 6)).minted!)
    expect(stock(r.state, inv.a, 'gold')).toBe(98)
    expect(stock(r.state, inv.b, 'gold')).toBe(102)
    expect(p.ledger.balance('a', 'pieces')).toBe(6)
    expect(p.ledger.balance('b', 'pieces')).toBe(-6)
    accept(post('a', q(pieces, 4), q(money, 8)).minted!)
    expect(p.ledger.log.map(l => l.currency ?? 'money')).toEqual(['pieces', 'pieces', 'money'])
    expect(p.ledger.log.map(l => l.batch)).toEqual(['txn.0001', 'txn.0002', 'txn.0002'])
    expect(p.ledger.balance('a') + p.ledger.balance('b')).toBe(0)
    expect(p.ledger.balance('a', 'pieces') + p.ledger.balance('b', 'pieces')).toBe(0)
  })
})
describe('M6 acceptance', () => {
  it('accepts part then caps an oversized acceptance at all remaining', () => {
    const { r, post, accept } = setup(), id = post('a').minted!
    accept(id, 3)
    expect(r.state.markets.port.offers![0].remaining).toBe(7)
    accept(id, 100)
    expect(r.state.trades!.map(t => t.gave.units)).toEqual([3, 7])
    expect(r.state.markets.port.offers).toEqual([])
  })
})
describe('M7 withdrawal', () => {
  it('allows only the owner and emits the owner reason', () => {
    const { r, post } = setup(), offer = post('a').minted!
    expect(() => r.run({ type: 'withdraw', offer, by: 'b' })).toThrow()
    expect(r.run({ type: 'withdraw', offer, by: 'a' }).events).toEqual([{ type: 'offerWithdrawn', offer, reason: 'owner' }])
    expect(r.state.markets.port.offers).toEqual([])
  })
})
describe('M8 expiry', () => {
  it('keeps expiry day inclusive and refuses expired acceptance before tick removal', () => {
    const { r, inv, post, accept } = setup(), offer = post('a', undefined, undefined, 0).minted!
    r.run({ type: 'tick' })
    expect(() => accept(offer)).toThrow('no offer')
    expect(r.run({ type: 'accept', offer, by: 'b', inventory: inv.b, cause: 'intent' }).events.at(-1))
      .toMatchObject({ type: 'shared.action.outcome', status: 'failed', stimuli: [{ reason: 'no-offer' }] })
    expect(r.run({ type: 'tick' }).events).toContainEqual({ type: 'offerWithdrawn', offer, reason: 'expired' })
  })
})
describe('M9 stale resting stock', () => {
  it('rolls back a failed fill, withdraws it and continues matching', () => {
    const { r, p, inv, post } = setup(), stale = post('a').minted!
    post('c')
    r.run({ type: 'removeStock', inventory: inv.a, good: 'fish', units: 100 })
    const result = post('b', q(timber, 20), q(fish, 10))
    expect(result.events).toContainEqual({ type: 'offerWithdrawn', offer: stale, reason: 'unfilled' })
    expect(r.state.trades!.map(t => t.maker)).toEqual(['c'])
    expect(stock(r.state, inv.a, 'timber')).toBe(100)
    expect(stock(r.state, inv.b, 'timber')).toBe(80)
    expect(p.ledger.log).toEqual([])
  })
})
describe('M10 observed views', () => {
  it('normalises both directions, filters windows and counts media purely', () => {
    const { r, post, accept } = setup()
    accept(post('a').minted!)
    accept(post('a', q(timber, 6), q(fish, 3)).minted!)
    r.run({ type: 'tick' })
    accept(post('a', q(pieces, 4), q(money, 8)).minted!)
    const before = JSON.stringify(r.state)
    expect(ratios(r.state, 'port', fish, timber, 0, 0)).toEqual([{ day: 0, ratio: 2, units: 10 }, { day: 0, ratio: 2, units: 3 }])
    expect(ratios(r.state, 'elsewhere', fish, timber, 0, 10)).toEqual([])
    expect(mediaInUse(r.state, 'port', 0, 10)).toEqual([{ asset: fish, trades: 2 }, { asset: timber, trades: 2 }, { asset: money, trades: 1 }, { asset: pieces, trades: 1 }])
    expect(JSON.stringify(r.state)).toBe(before)
  })
})
describe('M11 observed ratio fence', () => {
  it('allows only queries and index to mention the ratio query call', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)])
    for (const file of walk('src')) if (!['src/queries.ts', 'src/index.ts'].includes(file.replaceAll('\\', '/')))
      expect(readFileSync(file, 'utf8')).not.toContain('ratios(')
  })
})
describe('M12 compatibility', () => {
  it('keeps optional keys absent in three ports with no offers', () => {
    const run = simulate(3)
    expect(JSON.stringify(run.state)).not.toMatch(/"(?:offers|trades)":/)
  })
})
describe('M13 replay', () => {
  it('replays fills, withdrawals and expiry byte for byte', () => {
    const { r, post, accept, p } = setup()
    accept(post('a').minted!, 3)
    const offer = post('c').minted!
    r.run({ type: 'withdraw', offer, by: 'c' })
    post('d', undefined, undefined, 0)
    r.run({ type: 'tick' }); r.run({ type: 'tick' })
    const providers = stubProviders(), again = new Runner(undefined, r.config, providers)
    providers.ledger.currencies = currencyProvider(() => again.state)
    for (const cmd of r.log) again.run(cmd)
    expect(JSON.stringify([again.state, again.events, providers.ledger])).toBe(JSON.stringify([r.state, r.events, p.ledger]))
  })
})
describe('M14 incoming shortfall and outcomes', () => {
  it('refuses before any fill, leaves state unchanged and reports completed fill stimuli', () => {
    const { r, p, inv, post } = setup()
    const offer = post('a').minted!, before = JSON.stringify(r.state), spy = vi.spyOn(p.ledger, 'exchange')
    const cmd = { type: 'offer' as const, market: 'port', by: 'b', inventory: inv.b, give: q(timber, 101), want: q(fish, 10) }
    expect(r.run({ ...cmd, cause: 'short' }).events.at(-1)).toMatchObject({ status: 'failed', stimuli: [{ reason: 'beyond-stock' }] })
    expect(JSON.stringify(r.state)).toBe(before)
    expect(spy).not.toHaveBeenCalled()
    expect(() => r.run(cmd)).toThrow('beyond stock')
    expect(r.run({ type: 'accept', offer, by: 'b', inventory: inv.b, units: 2, cause: 'yes' }).events.at(-1))
      .toMatchObject({ status: 'completed', stimuli: [{ fills: 1, units: 2 }] })
    expect(r.run({ ...cmd, give: q(timber, 1), want: q(fish, 1), cause: 'post' }).events.at(-1))
      .toMatchObject({ status: 'completed', stimuli: [{ fills: 0, units: 0 }] })
  })
})
describe('M15 explicit exchange observations', () => {
  it('records only two opposite assets between two holders when a market is named', () => {
    const { r, inv } = setup()
    const legs = { goods: [{ from: inv.a, to: inv.b, good: 'fish', units: 2 }, { from: inv.b, to: inv.a, good: 'timber', units: 4 }] }
    r.run({ type: 'exchange', legs })
    expect(r.state.trades).toBeUndefined()
    r.run({ type: 'exchange', market: 'port', legs })
    expect(ratios(r.state, 'port', fish, timber, 0, 0)).toEqual([{ day: 0, ratio: 2, units: 2 }])
    r.run({ type: 'exchange', market: 'port', legs: { goods: [legs.goods[0]] } })
    expect(r.state.trades).toHaveLength(1)
  })
})
describe('M16 validation', () => {
  it('rejects invalid assets, units and ownership before effects', () => {
    const { r, inv, post } = setup(), before = JSON.stringify([r.state, r.events, r.log])
    for (const give of [q(fish, 0), q(fish, Infinity), q(fish, NaN), q({ good: 'missing' }, 1), q({ currency: 'missing' }, 1), q(timber, 2)])
      expect(() => post('a', give)).toThrow()
    expect(() => r.run({ type: 'offer', market: 'port', by: 'b', inventory: inv.a, give: q(fish, 1), want: q(timber, 1) })).toThrow()
    expect(JSON.stringify([r.state, r.events, r.log])).toBe(before)
  })
})
