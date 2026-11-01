import { afterEach, describe, expect, it, vi } from 'vitest'
import * as kernel from '@rex/kernel'
import { Runner, inTransit, stock, stubProviders, totalUnits } from '../src/index.ts'
import type { Asset, AssetUnits } from '../src/index.ts'

vi.mock('@rex/kernel', { spy: true })

const grain: Asset = { good: 'grain' }, timber: Asset = { good: 'timber' }, money: Asset = { currency: 'money' }
const q = (asset: Asset, units: number): AssetUnits => ({ asset, units })
const deliver = { route: { from: 'a', to: 'b' } }
function providers() {
  const p = stubProviders()
  p.transport.set('a', 'b', 2)
  return p
}
function setup() {
  const p = providers(), r = new Runner(undefined, undefined, p)
  for (const id of ['grain', 'timber']) r.run({ type: 'defineGood', good: { id, type: null, weight: null, spoilagePerDay: null, legal: null } })
  for (const id of ['a', 'b']) r.run({ type: 'openMarket', id, mode: 'abstract' })
  const inv: Record<string, string> = {}
  for (const by of ['seller', 'buyer']) for (const market of ['a', 'b']) {
    const id = r.run({ type: 'openInventory', holder: by, market }).minted!
    inv[`${by}${market}`] = id
    for (const good of ['grain', 'timber']) r.run({ type: 'addStock', inventory: id, good, units: 20 })
  }
  const post = () => r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb,
    fromInventory: inv.sellera, deliver, give: q(grain, 10), want: q(money, 30) }).minted!
  const accept = (offer: string, units?: number) => r.run({ type: 'accept', offer, by: 'buyer', inventory: inv.buyerb, units })
  const totals = () => [totalUnits(r.state, 'grain'), totalUnits(r.state, 'timber'),
    p.ledger.balance('buyer') + p.ledger.balance('seller')]
  return { r, p, inv, post, accept, totals }
}

afterEach(() => vi.restoreAllMocks())

describe('RD1 remote-dispatch', () => {
  it('keeps local fill event bytes and optional state keys unchanged', () => {
    const { r, inv, accept } = setup()
    const give = q(grain, 10), want = q(money, 30)
    const offer = r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb, give, want }).minted!
    expect(r.state.markets.b.offers![0]).toEqual({ id: offer, by: 'seller', inventory: inv.sellerb,
      give, want, remaining: 10, day: 0, expires: null })
    expect(JSON.stringify(accept(offer).events)).toBe(JSON.stringify([
      { type: 'stockChanged', inventory: inv.sellerb, good: 'grain', delta: -10, reason: 'exchange' },
      { type: 'stockChanged', inventory: inv.buyerb, good: 'grain', delta: 10, reason: 'exchange' },
      { type: 'offerFilled', offer, maker: 'seller', taker: 'buyer', gave: give, got: want },
    ]))
    expect(r.state.shipments).toEqual({})
    expect(r.state.counters.ship).toBeUndefined()
  })

  it('dispatches one goods leg and money in exactly one transfer, then arrives on the due-day tick', () => {
    const { r, p, inv, post, accept, totals } = setup(), before = totals()
    const offer = post(), exchange = vi.spyOn(p.ledger, 'exchange'), transfer = vi.mocked(kernel.transfer).mockClear()
    const result = accept(offer)
    const shipment = Object.values(r.state.shipments)[0]
    expect(exchange).toHaveBeenCalledTimes(1)
    expect(transfer).toHaveBeenCalledTimes(1)
    expect(transfer.mock.calls[0]).toHaveLength(3) // journal, money request, goods request
    expect(exchange.mock.calls[0][0]).toEqual({ money: [{ from: 'buyer', to: 'seller', currency: 'money', amount: 30 }],
      goods: [{ from: inv.sellera, to: `shipment:${shipment.id}`, good: 'grain', units: 10 }] })
    expect(shipment).toEqual({ id: shipment.id, from: inv.sellera, to: inv.buyerb, good: 'grain', units: 10,
      departed: 0, arrives: 2, status: 'transit' })
    expect(result.events).toContainEqual({ type: 'shipped', shipment: shipment.id, from: inv.sellera, to: inv.buyerb,
      good: 'grain', units: 10, arrives: 2, freightTxn: null })
    expect([stock(r.state, inv.sellera, 'grain'), stock(r.state, inv.sellerb, 'grain'), stock(r.state, inv.buyerb, 'grain')]).toEqual([10, 20, 20])
    expect([p.ledger.balance('seller'), p.ledger.balance('buyer')]).toEqual([30, -30])
    expect(totals()).toEqual(before)
    for (let day = 0; day < 2; day++) {
      r.run({ type: 'tick' })
      expect(inTransit(r.state, 'grain')).toBe(10)
      expect(totals()).toEqual(before)
    }
    r.run({ type: 'tick' }) // Existing tick order processes arrivals before advancing the day.
    expect(stock(r.state, inv.buyerb, 'grain')).toBe(30)
    expect(inTransit(r.state, 'grain')).toBe(0)
    expect(totals()).toEqual(before)
  })

  it('accepts remote outgoing goods for a resting currency offer', () => {
    const { r, p, inv, totals } = setup(), before = totals()
    const offer = r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb,
      give: q(money, 30), want: q(grain, 10) }).minted!
    r.run({ type: 'accept', offer, by: 'buyer', inventory: inv.buyerb, fromInventory: inv.buyera, deliver })
    expect(Object.values(r.state.shipments)[0]).toMatchObject({ from: inv.buyera, to: inv.sellerb, units: 10 })
    expect(p.ledger.balance('buyer')).toBe(30)
    expect(totals()).toEqual(before)
  })

  it('carries incoming dispatch through crossing, resting remainders and partial fills', () => {
    const { r, inv, totals } = setup(), before = totals()
    r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb, give: q(money, 12), want: q(grain, 4) })
    const incoming = r.run({ type: 'offer', market: 'b', by: 'buyer', inventory: inv.buyerb,
      fromInventory: inv.buyera, deliver, give: q(grain, 10), want: q(money, 30) }).minted!
    expect(r.state.markets.b.offers![0]).toMatchObject({ id: incoming, remaining: 6, fromInventory: inv.buyera, deliver })
    for (const units of [2, 4]) r.run({ type: 'accept', offer: incoming, by: 'seller', inventory: inv.sellerb, units })
    expect(Object.values(r.state.shipments).map(s => s.units)).toEqual([4, 2, 4])
    expect(r.state.markets.b.offers).toEqual([])
    expect(totals()).toEqual(before)
  })

  it('ships both barter goods in the same atomic transfer and conserves each asset through arrival', () => {
    const { r, p, inv, totals } = setup(), before = totals()
    const offer = r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb,
      fromInventory: inv.sellera, deliver, give: q(grain, 10), want: q(timber, 5) }).minted!
    const transfer = vi.mocked(kernel.transfer).mockClear()
    r.run({ type: 'accept', offer, by: 'buyer', inventory: inv.buyerb, fromInventory: inv.buyera, deliver })
    expect(transfer).toHaveBeenCalledTimes(1)
    expect(Object.values(r.state.shipments).map(s => [s.good, s.units])).toEqual([['grain', 10], ['timber', 5]])
    expect(p.ledger.log).toEqual([])
    for (let day = 0; day < 4; day++) {
      expect(totals()).toEqual(before)
      r.run({ type: 'tick' })
    }
    expect(totals()).toEqual(before)
    expect([stock(r.state, inv.buyerb, 'grain'), stock(r.state, inv.sellerb, 'timber')]).toEqual([30, 25])
  })

  it('rolls back money, goods, pending shipments and ids when stale remote stock refuses', () => {
    const { r, p, inv, post, accept } = setup(), offer = post()
    r.run({ type: 'removeStock', inventory: inv.sellera, good: 'grain', units: 20 })
    const before = structuredClone({ inventories: r.state.inventories, counters: r.state.counters, ledger: p.ledger })
    const transfer = vi.mocked(kernel.transfer).mockClear()
    expect(accept(offer).events).toEqual([{ type: 'offerWithdrawn', offer, reason: 'unfilled' }])
    expect(transfer).toHaveBeenCalledTimes(1) // Failure happens after the money leg, inside the atomic batch.
    expect({ inventories: r.state.inventories, counters: r.state.counters, ledger: p.ledger }).toEqual(before)
    expect(r.state.shipments).toEqual({})
    expect(r.state.trades).toBeUndefined()
  })

  it('rolls back an earlier goods debit when a later goods leg refuses', () => {
    const { r, p, inv } = setup()
    const offer = r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb,
      fromInventory: inv.sellera, deliver, give: q(grain, 10), want: q(timber, 5) }).minted!
    const before = structuredClone(r.state.inventories), original = p.ledger.exchange.bind(p.ledger)
    vi.spyOn(p.ledger, 'exchange').mockImplementation((legs, kind, subject, note, goods) => original(legs, kind, subject, note, {
      ...goods!, apply: (account, quantity, delta) => {
        goods!.apply(account, quantity, delta)
        if (quantity === 'timber' && delta < 0) throw new Error('host refused goods')
      },
    }))
    r.run({ type: 'accept', offer, by: 'buyer', inventory: inv.buyerb, fromInventory: inv.buyera, deliver })
    expect(r.state.inventories).toEqual(before)
    expect(r.state.shipments).toEqual({})
    expect(r.state.counters.ship).toBeUndefined()
    expect(p.ledger.log).toEqual([])
  })

  it('refuses incoming remote shortfall before minting a shipment or moving money', () => {
    const { r, p, inv } = setup()
    const offer = r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb,
      give: q(money, 30), want: q(grain, 30) }).minted!
    const before = JSON.stringify(r.state), exchange = vi.spyOn(p.ledger, 'exchange')
    const result = r.run({ type: 'accept', offer, by: 'buyer', inventory: inv.buyerb,
      fromInventory: inv.buyera, deliver, cause: 'remote-intent' })
    expect(result.events.at(-1)).toMatchObject({ status: 'failed', stimuli: [{ reason: 'beyond-stock' }] })
    expect(JSON.stringify(r.state)).toBe(before)
    expect(exchange).not.toHaveBeenCalled()
  })

  it('validates source ownership, route endpoints and reachability before effects', () => {
    const { r, p, inv } = setup()
    const cmd = { type: 'offer' as const, market: 'b', by: 'seller', inventory: inv.sellerb,
      fromInventory: inv.sellera, deliver, give: q(grain, 10), want: q(money, 30) }
    const before = JSON.stringify([r.state, r.events, r.log, p.ledger])
    for (const bad of [
      { ...cmd, fromInventory: inv.buyera },
      { ...cmd, deliver: undefined },
      { ...cmd, deliver: { route: { from: 'b', to: 'a' } } },
      { ...cmd, give: q(money, 30), want: q(grain, 10) },
    ]) expect(() => r.run(bad)).toThrow()
    for (const days of [Infinity, NaN, -1]) {
      p.transport.set('a', 'b', days)
      expect(() => r.run(cmd)).toThrow('no route')
    }
    expect(JSON.stringify([r.state, r.events, r.log, p.ledger])).toBe(before)
  })

  it('uses an alternate local source without delivery and keeps the receiving inventory separate', () => {
    const { r, inv, accept } = setup()
    const fromInventory = r.run({ type: 'openInventory', holder: 'seller', market: 'b' }).minted!
    r.run({ type: 'addStock', inventory: fromInventory, good: 'grain', units: 10 })
    const offer = r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb,
      fromInventory, give: q(grain, 10), want: q(money, 30) }).minted!
    accept(offer)
    expect(stock(r.state, fromInventory, 'grain')).toBe(0)
    expect(stock(r.state, inv.sellerb, 'grain')).toBe(20)
    expect(r.state.shipments).toEqual({})
  })

  it('does not leave a shipment when a previously available route disappears', () => {
    const { r, p, post, accept } = setup(), offer = post(), before = structuredClone(r.state.inventories)
    p.transport.set('a', 'b', Infinity)
    expect(accept(offer).events).toEqual([{ type: 'offerWithdrawn', offer, reason: 'unfilled' }])
    expect(r.state.inventories).toEqual(before)
    expect(r.state.shipments).toEqual({})
    expect(p.ledger.log).toEqual([])
  })

  it('continues crossing after rollback and reuses only the uncommitted shipment id', () => {
    const { r, p, inv, post, totals } = setup(), stale = post()
    r.run({ type: 'removeStock', inventory: inv.sellera, good: 'grain', units: 20 })
    r.run({ type: 'offer', market: 'b', by: 'seller', inventory: inv.sellerb,
      give: q(grain, 10), want: q(money, 30), deliver: { route: { from: 'b', to: 'b' } } })
    const before = totals()
    const result = r.run({ type: 'offer', market: 'b', by: 'buyer', inventory: inv.buyerb,
      give: q(money, 30), want: q(grain, 10) })
    expect(result.events).toContainEqual({ type: 'offerWithdrawn', offer: stale, reason: 'unfilled' })
    expect(Object.values(r.state.shipments)).toHaveLength(1)
    expect(r.state.counters.ship).toBe(1)
    expect(p.ledger.log).toHaveLength(1)
    expect(totals()).toEqual(before)
    r.run({ type: 'tick' }) // A zero-day route still uses the normal shipment-arrival step.
    expect(stock(r.state, inv.buyerb, 'grain')).toBe(30)
    expect(totals()).toEqual(before)
    const againProviders = providers(), again = new Runner(undefined, r.config, againProviders)
    for (const cmd of r.log) again.run(cmd)
    expect(JSON.stringify([again.state, again.events, againProviders.ledger])).toBe(JSON.stringify([r.state, r.events, p.ledger]))
  })

  it('replays partial dispatch, in-transit state and arrival with identical state, events and ledger bytes', () => {
    const { r, p, post, accept } = setup(), offer = post()
    accept(offer, 4)
    r.run({ type: 'tick' })
    accept(offer)
    const replay = () => {
      const againProviders = providers(), again = new Runner(undefined, r.config, againProviders)
      for (const cmd of r.log) again.run(cmd)
      expect(JSON.stringify([again.state, again.events, againProviders.ledger])).toBe(JSON.stringify([r.state, r.events, p.ledger]))
    }
    replay()
    for (let i = 0; i < 4; i++) r.run({ type: 'tick' })
    replay()
  })
})
