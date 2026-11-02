import { afterEach, describe, expect, it, vi } from 'vitest'
import * as kernel from '@rex/kernel'
import { Runner, inTransit, stock, stubProviders, totalUnits } from '../src/index.ts'

vi.mock('@rex/kernel', { spy: true })

function providers() {
  const p = stubProviders()
  p.transport.set('a', 'b', 2)
  return p
}

function setup(spoilagePerDay: number | null = null) {
  const p = providers(), r = new Runner(undefined, undefined, p)
  for (const id of ['grain', 'timber']) r.run({ type: 'defineGood', good: {
    id, type: null, weight: null, spoilagePerDay: id === 'grain' ? spoilagePerDay : null, legal: null,
  } })
  for (const id of ['a', 'b']) r.run({ type: 'openMarket', id, mode: 'abstract' })
  const from = r.run({ type: 'openInventory', holder: 'seller', market: 'a' }).minted!
  const receiving = r.run({ type: 'openInventory', holder: 'seller', market: 'b' }).minted!
  const to = r.run({ type: 'openInventory', holder: 'buyer', market: 'b' }).minted!
  const lost = r.run({ type: 'openInventory', holder: 'host loss account', market: 'a' }).minted!
  for (const good of ['grain', 'timber']) r.run({ type: 'addStock', inventory: from, good, units: 20 })
  const ship = (good = 'grain', units = 10) => r.run({ type: 'ship', from, to, good, units }).minted!
  const remote = () => {
    const offer = r.run({ type: 'offer', market: 'b', by: 'seller', inventory: receiving,
      fromInventory: from, deliver: { route: { from: 'a', to: 'b' } },
      give: { asset: { good: 'grain' }, units: 10 }, want: { asset: { currency: 'money' }, units: 30 },
    }).minted!
    r.run({ type: 'accept', offer, by: 'buyer', inventory: to })
    return Object.values(r.state.shipments).at(-1)!.id
  }
  const snapshot = () => JSON.stringify([r.state, r.events, r.log, p.ledger])
  return { r, p, from, to, lost, ship, remote, snapshot }
}

afterEach(() => vi.restoreAllMocks())

describe('SL1 shipment-loss', () => {
  it('moves cargo once in one kernel transfer and logs the host decision with its cause', () => {
    const { r, p, from, to, lost, ship } = setup(), shipment = ship()
    const before = structuredClone(r.state.shipments[shipment])
    const transfer = vi.mocked(kernel.transfer).mockClear()
    const command = { type: 'loseShipment' as const, shipment, to: lost, cause: 'voyage outcome' }
    const result = r.run(command)
    expect(transfer).toHaveBeenCalledTimes(1)
    expect(transfer.mock.calls[0]).toHaveLength(2)
    expect(transfer.mock.calls[0][1]).toMatchObject({
      t: 0, process: 'economy.trade.shipment', quantity: 'grain', unit: 'count', amount: 10,
      from: { account: `shipment:${shipment}` }, to: { account: lost },
    })
    expect(r.state.shipments[shipment]).toEqual({ ...before, status: 'lost' })
    expect([stock(r.state, from, 'grain'), stock(r.state, to, 'grain'), stock(r.state, lost, 'grain'),
      inTransit(r.state, 'grain')]).toEqual([10, 0, 10, 0])
    expect(result.events).toEqual([{ type: 'stockChanged', inventory: lost, good: 'grain', delta: 10,
      reason: `loseShipment:${shipment}`, cause: command.cause }])
    expect(r.log.at(-1)).toEqual(command)
    expect(p.ledger.log).toEqual([])
  })

  it('skips lost cargo on and after its due day while other shipments arrive normally', () => {
    const { r, to, lost, ship } = setup(), shipment = ship(), normal = ship('timber', 5)
    r.run({ type: 'loseShipment', shipment, to: lost })
    for (let day = 0; day < 5; day++) {
      const result = r.run({ type: 'tick' })
      expect(result.events.some(e => e.type === 'arrived' && e.shipment === shipment)).toBe(false)
      expect(stock(r.state, to, 'grain')).toBe(0)
      expect(stock(r.state, lost, 'grain')).toBe(10)
    }
    expect(r.state.shipments[shipment].status).toBe('lost')
    expect(r.state.shipments[normal].status).toBe('arrived')
    expect(stock(r.state, to, 'timber')).toBe(5)
  })

  it('conserves each asset across inventories, transit, losses and paid remote dispatch', () => {
    const { r, p, lost, ship, remote } = setup()
    r.run({ type: 'defineCurrency', currency: { id: 'pieces' } })
    p.ledger.currencies = { isCurrency: id => id === 'pieces' }
    r.run({ type: 'exchange', legs: { money: [{ from: 'buyer', to: 'seller', currency: 'pieces', amount: 7 }] } })
    const totals = () => ['grain', 'timber'].map(good => totalUnits(r.state, good)).concat(
      ['money', 'pieces'].map(currency => p.ledger.balance('buyer', currency) + p.ledger.balance('seller', currency)))
    const before = totals(), grain = remote(), timber = ship('timber', 7.5)
    expect(totals()).toEqual(before)
    const ledger = JSON.stringify(p.ledger)
    for (const shipment of [grain, timber]) {
      r.run({ type: 'loseShipment', shipment, to: lost })
      expect(totals()).toEqual(before)
      expect(JSON.stringify(p.ledger)).toBe(ledger)
    }
    for (let day = 0; day < 4; day++) {
      r.run({ type: 'tick' })
      expect(totals()).toEqual(before)
    }
    expect([stock(r.state, lost, 'grain'), stock(r.state, lost, 'timber')]).toEqual([10, 7.5])
  })

  it('replays ordinary and remote shipment losses from JSON log with equal state, events and ledger', () => {
    const { r, p, lost, ship, remote } = setup(), grain = remote(), timber = ship('timber')
    r.run({ type: 'tick' })
    for (const shipment of [grain, timber]) r.run({ type: 'loseShipment', shipment, to: lost })
    const replay = () => {
      const againProviders = providers(), again = new Runner(undefined, r.config, againProviders)
      for (const cmd of JSON.parse(JSON.stringify(r.log))) again.run(cmd)
      expect(JSON.stringify([again.state, again.events, again.log, againProviders.ledger]))
        .toBe(JSON.stringify([r.state, r.events, r.log, p.ledger]))
    }
    replay()
    for (let day = 0; day < 4; day++) r.run({ type: 'tick' })
    replay()
  })

  it.each(['unknown shipment', 'already arrived', 'already lost', 'unknown inventory'])(
    'refuses %s without moving cargo or changing state, events, log or ledger', refusal => {
      const { r, lost, ship, snapshot } = setup()
      let shipment = ship(), destination = lost
      if (refusal === 'unknown shipment') shipment = 'missing'
      if (refusal === 'already arrived') for (let day = 0; day < 3; day++) r.run({ type: 'tick' })
      if (refusal === 'already lost') r.run({ type: 'loseShipment', shipment, to: lost })
      if (refusal === 'unknown inventory') destination = 'missing'
      const before = snapshot(), transfer = vi.mocked(kernel.transfer).mockClear()
      expect(() => r.run({ type: 'loseShipment', shipment, to: destination })).toThrow(
        refusal === 'unknown inventory' ? /unknown inventory/ : refusal === 'unknown shipment' ? /unknown shipment/ : /not in transit/)
      expect(transfer).not.toHaveBeenCalled()
      expect(snapshot()).toBe(before)
    },
  )

  it.each([0.25, 1])('resolves only remaining cargo after spoilage at rate %s, including empty cargo', rate => {
    const { r, to, lost, ship } = setup(rate), shipment = ship()
    r.run({ type: 'tick' })
    const units = 10 * (1 - rate), before = totalUnits(r.state, 'grain')
    expect(r.state.shipments[shipment].units).toBe(units)
    const transfer = vi.mocked(kernel.transfer).mockClear()
    r.run({ type: 'loseShipment', shipment, to: lost })
    expect(transfer).toHaveBeenCalledTimes(units > 0 ? 1 : 0)
    expect(stock(r.state, lost, 'grain')).toBe(units)
    expect(totalUnits(r.state, 'grain')).toBe(before)
    expect(r.state.shipments[shipment].status).toBe('lost')
    for (let day = 0; day < 3; day++) r.run({ type: 'tick' })
    expect(stock(r.state, to, 'grain')).toBe(0)
    // Lost cargo remains an ordinary inventory and follows its good's spoilage rate there.
    expect(stock(r.state, lost, 'grain')).toBe(units * (1 - rate) ** 3)
  })
})
