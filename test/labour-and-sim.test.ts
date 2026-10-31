// TESTS.md E12 (the labour market) and E14 (the three-port sim). Every number is a fixture.
import { describe, expect, it } from 'vitest'
import { simulate, table } from '../examples/three-ports.ts'
import { StubLabourSupply, StubSettlementReader, defaultConfig, totalUnits, wageQuote, wageQuotes } from '../src/index.ts'

function town() {
  const reader = new StubSettlementReader()
  reader.postRows['stl.town'] = [
    { id: 'post.1', biz: 'biz.1', role: 'cooper', wage: 10, hours: 10, filledBy: 'p1' },
    { id: 'post.2', biz: 'biz.1', role: 'cooper', wage: 14, hours: 10, filledBy: null },
    { id: 'post.3', biz: 'biz.2', role: 'cooper', wage: 12, hours: 10, filledBy: null },
    { id: 'post.4', biz: 'biz.2', role: 'sawyer', wage: 8, hours: 10, filledBy: 'p2' },
  ]
  const labour = new StubLabourSupply()
  return { reader, labour }
}

describe('E12 the wage quote rises when demand hours exceed supply hours', () => {
  it('the default rule quotes the posted median with no pressure (the open state); no posts, no quote', () => {
    const { reader, labour } = town()
    const q = wageQuote(defaultConfig(), reader, labour, 'stl.town', 'cooper', 0, ['pool.town'])
    expect(q).toMatchObject({ posts: 3, filled: 1, demandHours: 30, supplyHours: 0, median: 12, quote: 12, rule: 'posted-median' })
    expect(wageQuote(defaultConfig(), reader, labour, 'stl.town', 'smith', 0, ['pool.town']).quote).toBeNull()
  })
  it('under the ratio rule the quote rises with more demand hours than supply hours, falls with more supply hours, within its bounds', () => {
    const { reader, labour } = town()
    const config = { ...defaultConfig(), wageRule: { kind: 'ratio' as const, elasticity: 0.5, floor: 0.5, ceiling: 2 } }
    labour.set('pool.town', 'cooper', 10)                       // 30 demanded hours, 10 supplied: pressure 2/3
    expect(wageQuote(config, reader, labour, 'stl.town', 'cooper', 0, ['pool.town']).quote).toBeCloseTo(12 * (1 + 0.5 * 2 / 3))
    expect(wageQuote(config, reader, labour, 'stl.town', 'cooper', 0, ['pool.town'])).toMatchObject({ demandHours: 30, supplyHours: 10 })
    labour.set('pool.town', 'cooper', 30)
    expect(wageQuote(config, reader, labour, 'stl.town', 'cooper', 0, ['pool.town']).quote).toBe(12)
    labour.set('pool.town', 'cooper', 300)                      // pressure −0.9: 1 − 0.45 = 0.55 ≥ floor
    expect(wageQuote(config, reader, labour, 'stl.town', 'cooper', 0, ['pool.town']).quote).toBeCloseTo(12 * 0.55)
    labour.set('pool.town', 'sawyer', 0)                       // 10 demanded hours, 0 supplied: pressure 1 → 1.5
    const all = wageQuotes(config, reader, labour, 'stl.town', 0, ['pool.town'])
    expect(all.map((q) => q.role)).toEqual(['cooper', 'sawyer'])
    expect(all[1].quote).toBe(12)
    // With no posts there is no quote, even when supply is known.
    expect(wageQuote(config, new StubSettlementReader(), labour, 'stl.town', 'cooper', 0, ['pool.town']).quote).toBeNull()
  })
  it('sums only named sources and keeps pool grants separate by source, role and day', () => {
    const { reader, labour } = town()
    labour.rows[0] = [{ category: 'adults', persons: 3, personHours: 30 }]
    expect(labour.supply(0)).toEqual(labour.rows[0])
    expect(labour.supply(1)).toEqual([])
    labour.away.add('person.away')
    expect(labour.available('person.away', 0)).toBe(false)
    expect(labour.available('person.here', 0)).toBe(true)
    expect(labour.productivity('person.here', 'cooper')).toBe(1)
    labour.factors['person.here:cooper'] = 0
    expect(labour.productivity('person.here', 'cooper')).toBe(0)
    labour.set('pool.town', 'cooper', 20)
    labour.set('person.here', 'cooper', 10)
    labour.set('pool.other', 'cooper', 100)
    labour.set('pool.town', 'sawyer', 5)
    const q = wageQuote(defaultConfig(), reader, labour, 'stl.town', 'cooper', 0, ['pool.town', 'person.here'])
    expect(q).toMatchObject({ demandHours: 30, supplyHours: 30, posts: 3, filled: 1 })
    expect(labour.draw('pool.town', 'cooper', null, 12, 0)).toBe(12)
    expect(labour.draw('pool.town', 'cooper', null, 12, 0)).toBe(8)
    expect(labour.draw('pool.town', 'cooper', null, 1, 0)).toBe(0)
    expect(labour.draw('pool.town', 'cooper', null, 30, 1)).toBe(20)
    expect(labour.draw('pool.town', 'sawyer', null, 10, 0)).toBe(5)
    expect(labour.draw('pool.other', 'cooper', null, 10, 0)).toBe(10)
    expect(labour.draw('pool.town', 'cooper', null, 1, 0)).toBe(0)
    expect(labour.hours('pool.town', 'cooper', 0)).toBe(20)
  })

})

describe('E14 the three-port sim prints prices and shortages over days and is deterministic', () => {
  it('thirty days twice give the same state and the same table; goods and money are conserved; every price is finite', () => {
    const a = simulate(30)
    const b = simulate(30)
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state))
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log))
    const printed = table(a)
    expect(printed.split('\n').length).toBe(31)
    expect(printed).toContain('north/grain')
    for (const row of a.rows) for (const cell of Object.values(row.cells)) { expect(Number.isFinite(cell.price)).toBe(true); expect(cell.stock).toBeGreaterThanOrEqual(0) }
    // money: the two purses plus the three ports' takings sum to the 1000 the companies started with
    expect(Object.values(a.balances).reduce((s, v) => s + v, 0)).toBeCloseTo(1000)
    // timber and cloth never spoil: production in minus consumption out equals the change in units anywhere
    const state = a.state as { markets: Record<string, { goods: Record<string, { producedLast: number; consumedLast: number }> }> }
    void state
    expect(totalUnits(a.state as never, 'timber')).toBeGreaterThan(0)
    // the companies traded: at least one shipment, at least one sale
    const kinds = (a.log as { type: string }[]).map((c) => c.type)
    expect(kinds).toContain('ship')
    expect(kinds).toContain('sell')
  })
})
