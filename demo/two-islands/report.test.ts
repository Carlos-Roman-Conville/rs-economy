import { describe, expect, it } from 'vitest'
import type { Asset } from '../../src/index.ts'
import { loadFixture } from './fixture.ts'
import { ratioGapFromBook, report } from './report.ts'
import { runTwoIslands } from './run.ts'

const fixture = loadFixture()
const days = 25
const assetId = (asset: Asset) => ('good' in asset ? asset.good : asset.currency)

function crossOffersFromLog(result: ReturnType<typeof runTwoIslands>): Map<number, number> {
  const counts = new Map<number, number>()
  let day = 0
  for (const { command } of result.logs.economy) {
    if (command.type === 'tick') { day++; continue }
    if (command.type === 'offer' && fixture.minds[command.by].market !== command.market) {
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
  }
  return counts
}

function crossFillsFromTrades(result: ReturnType<typeof runTwoIslands>): Map<number, number> {
  const counts = new Map<number, number>()
  for (const { day, trades } of result.days) {
    const n = trades.filter(t => fixture.minds[t.maker].market !== fixture.minds[t.taker].market).length
    if (n) counts.set(day, n)
  }
  return counts
}

describe('TIH2 two-islands cross report (design v2 §8)', () => {
  it('cross offer and cross fill counts match logs and trades', () => {
    const result = runTwoIslands(fixture, { days })
    const data = report(result, fixture)
    const offers = crossOffersFromLog(result)
    const fills = crossFillsFromTrades(result)
    for (const row of data.cross.days) {
      expect(row.crossOffers).toBe(offers.get(row.day) ?? 0)
      expect(row.crossFills).toBe(fills.get(row.day) ?? 0)
    }
  }, 180_000)

  it('each book row matches a resting offer on the last day', () => {
    const result = runTwoIslands(fixture, { days })
    const last = result.days.at(-1)!
    const stateOffers = Object.values(result.state.economy.markets).flatMap(market =>
      (market.offers ?? []).map(offer => ({
        market: market.id,
        give: assetId(offer.give.asset),
        want: assetId(offer.want.asset),
        by: offer.by,
        ratio: offer.want.units / offer.give.units,
      })))
    expect(last.book).toEqual(stateOffers)
  }, 180_000)

  it('ratio gap is null without a cross pair and matches hand computation otherwise', () => {
    const result = runTwoIslands(fixture, { days })
    const data = report(result, fixture)
    for (const row of data.cross.days) {
      const hand = ratioGapFromBook(result.days.find(d => d.day === row.day)!.book, fixture)
      expect(row.ratioGap).toBe(hand)
    }
  }, 180_000)

  it('seeds table is deterministic and does not assert an outcome value', () => {
    const result = runTwoIslands(fixture, { days })
    const a = report(result, fixture, { seeds: true }).seeds
    const b = report(result, fixture, { seeds: true }).seeds
    expect(a).toEqual(b)
    for (const row of a) {
      expect(['converged', 'gap-persists', 'rival-conventions', 'undetermined']).toContain(row.outcome)
    }
  }, 900_000)
})
