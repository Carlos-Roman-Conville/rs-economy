// TESTS.md T: goods transfers preserve conservation, events and replay.
import { describe, expect, it } from 'vitest'
import { transfer, TransferJournal } from '@rex/kernel'
import { Runner, stock, totalUnits, inTransit, stubProviders } from '../src/index.ts'
import { goodsLedger } from '../src/goods-ledger.ts'
import type { Ctx } from '../src/context.ts'

function providers() {
  const result = stubProviders()
  result.transport.set('a', 'b', 2)
  return result
}
function setup(spoilagePerDay: number | null = null) {
  const runner = new Runner(undefined, undefined, providers())
  runner.run({ type: 'defineGood', good: { id: 'grain', type: null, weight: null, spoilagePerDay, legal: null } })
  for (const id of ['a', 'b']) runner.run({ type: 'openMarket', id, mode: 'abstract' })
  const from = runner.run({ type: 'openInventory', holder: 'trader', market: 'a' }).minted!
  const to = runner.run({ type: 'openInventory', holder: 'trader', market: 'b' }).minted!
  const stall = runner.state.markets.a.inventory
  runner.run({ type: 'addStock', inventory: stall, good: 'grain', units: 20 })
  return { runner, from, to, stall }
}
function context(runner: Runner): Ctx {
  return { state: structuredClone(runner.state), config: runner.config, providers: runner.providers,
    events: [{ type: 'dayEnded', day: 0 }], minted: null, taken: null }
}
const changed = (inventory: string, delta: number, reason: string) =>
  ({ type: 'stockChanged', inventory, good: 'grain', delta, reason })

describe('T1 buy conserves goods and preserves event bytes', () => {
  it('preserves legacy self-trade events when both holders are the stall', () => {
    const { runner, stall } = setup()
    for (const type of ['buy', 'sell'] as const) {
      const result = runner.run({ type, inventory: stall, good: 'grain', units: 5, price: 2 })
      expect(stock(runner.state, stall, 'grain')).toBe(20)
      expect(result.events.slice(0, 2)).toEqual([changed(stall, -5, type), changed(stall, 5, type)])
    }
  })
  it('debits the stall and credits the buyer by exactly q in the original order', () => {
    const { runner, from, stall } = setup()
    const result = runner.run({ type: 'buy', inventory: from, good: 'grain', units: 5, price: 2 })
    expect(stock(runner.state, stall, 'grain')).toBe(15)
    expect(stock(runner.state, from, 'grain')).toBe(5)
    expect(JSON.stringify(result.events.slice(0, 2))).toBe(JSON.stringify([changed(stall, -5, 'buy'), changed(from, 5, 'buy')]))
    expect(totalUnits(runner.state, 'grain')).toBe(20)
  })
})

describe('T2 sell conserves goods and preserves event bytes', () => {
  it('debits the seller and credits the stall by exactly q in the original order', () => {
    const { runner, from, stall } = setup()
    runner.run({ type: 'buy', inventory: from, good: 'grain', units: 5, price: 2 })
    const result = runner.run({ type: 'sell', inventory: from, good: 'grain', units: 3, price: 2 })
    expect(stock(runner.state, from, 'grain')).toBe(2)
    expect(stock(runner.state, stall, 'grain')).toBe(18)
    expect(JSON.stringify(result.events.slice(0, 2))).toBe(JSON.stringify([changed(from, -3, 'sell'), changed(stall, 3, 'sell')]))
    expect(totalUnits(runner.state, 'grain')).toBe(20)
  })
})

describe('T3 dispatch and arrival conserve inventory plus transit every day', () => {
  it('holds cargo only in transit between the debit and credit, preserving event reasons', () => {
    const { runner, from, to } = setup()
    runner.run({ type: 'buy', inventory: from, good: 'grain', units: 5, price: 2 })
    const sent = runner.run({ type: 'ship', from, to, good: 'grain', units: 5 })
    expect(sent.events[0]).toEqual(changed(from, -5, `ship:${sent.minted}`))
    expect(stock(runner.state, from, 'grain')).toBe(0)
    for (let day = 0; day < 3; day++) {
      expect(stock(runner.state, to, 'grain')).toBe(0)
      expect(inTransit(runner.state, 'grain')).toBe(5)
      expect(totalUnits(runner.state, 'grain')).toBe(20)
      runner.run({ type: 'tick' })
      expect(totalUnits(runner.state, 'grain')).toBe(20)
    }
    expect(stock(runner.state, to, 'grain')).toBe(5)
    expect(inTransit(runner.state, 'grain')).toBe(0)
    expect(runner.events.filter(e => e.type === 'stockChanged' && e.reason.startsWith('arrive:')))
      .toEqual([changed(to, 5, `arrive:${sent.minted}`)])
  })
  it('preserves zero-delta arrival when all cargo has spoiled', () => {
    const { runner, from, to } = setup(1)
    runner.run({ type: 'buy', inventory: from, good: 'grain', units: 5, price: 2 })
    const sent = runner.run({ type: 'ship', from, to, good: 'grain', units: 5 })
    for (let day = 0; day < 3; day++) runner.run({ type: 'tick' })
    expect(runner.state.shipments[sent.minted!].status).toBe('arrived')
    expect(runner.events).toContainEqual(changed(to, 0, `arrive:${sent.minted}`))
  })
})

describe('T4 goods ledger validates accounts, goods and shipment quantities', () => {
  it('declares count and rejects unknown inventories, shipments and goods', () => {
    const { runner, from, to, stall } = setup()
    const sent = runner.run({ type: 'ship', from: stall, to, good: 'grain', units: 5 })
    const ctx = context(runner)
    const ledger = goodsLedger(ctx, 'test')
    const account = `shipment:${sent.minted}`
    expect(ledger.id).toBe('economy.goods')
    expect(ledger.unit(from, 'grain')).toBe('count')
    expect(ledger.unit(account, 'grain')).toBe('count')
    expect(() => ledger.unit('missing', 'grain')).toThrow(/inventory/)
    expect(() => ledger.unit('shipment:missing', 'grain')).toThrow(/shipment/)
    expect(() => ledger.unit(from, 'missing')).toThrow(/good/)
    expect(() => ledger.unit(account, 'missing')).toThrow(/good/)
    const before = JSON.stringify(ctx)
    ledger.apply(account, 'grain', 5)
    ledger.apply(account, 'grain', -5)
    expect(JSON.stringify(ctx)).toBe(before)
    expect(() => ledger.apply(account, 'grain', 4)).toThrow(/does not match/)
    expect(() => ledger.apply(account, 'grain', -4)).toThrow(/does not match/)
  })
})

describe('T5 owner overdraw refusal rolls back the whole transfer batch', () => {
  it('restores inventories, pre-existing events and journal after an earlier successful transfer', () => {
    const { runner, from, stall } = setup()
    const ctx = context(runner)
    const ledger = goodsLedger(ctx, 'buy')
    const journal = new TransferJournal('economy.goods')
    const request = (amount: number) => ({ t: 0, process: 'economy.trade.trade', quantity: 'grain', unit: 'count', amount,
      from: { ledger, account: stall }, to: { ledger, account: from } })
    const before = JSON.stringify({ inventories: ctx.state.inventories, events: ctx.events })
    expect(() => transfer(journal, request(5), request(16))).toThrow(/would go negative/)
    expect(JSON.stringify({ inventories: ctx.state.inventories, events: ctx.events })).toBe(before)
    expect(journal.entries()).toEqual([])
  })
})

describe('T6 trade and shipment replay is byte-identical (E3)', () => {
  it('replays trades, dispatch and arrival without persisting journals', () => {
    const { runner, from, to } = setup()
    runner.run({ type: 'buy', inventory: from, good: 'grain', units: 8, price: 2 })
    runner.run({ type: 'sell', inventory: from, good: 'grain', units: 3, price: 2 })
    runner.run({ type: 'ship', from, to, good: 'grain', units: 5 })
    for (let day = 0; day < 3; day++) runner.run({ type: 'tick' })
    const again = Runner.replay(runner.log, runner.config, providers())
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(runner.state))
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(runner.events))
  })
})
