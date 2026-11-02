import { defaultConfig, ratios, mediaInUse, accounts, type Asset } from '../../src/index.ts'
import type { LedgerProvider } from '../../src/providers.ts'
import { balanceOf, ledger } from '../../../settlement/src/index.ts'
import { acceptance, type AcceptanceRecord } from '../../../society/src/index.ts'
import type { PersonId } from '../../../society/src/index.ts'
import type { TwoIslandsFixture } from './fixture.ts'
import { runTwoIslands } from './run.ts'

export type TwoIslandsRunResult = ReturnType<typeof runTwoIslands>
export type ReportOutcome = 'converged' | 'gap-persists' | 'rival-conventions' | 'undetermined'

export interface ReportOptions {
  /** Test-only wrapper: alternate Society records without touching the run. */
  records?: readonly AcceptanceRecord[]
}

export interface RatioDayRow {
  day: number
  spread: number
  stdev: number
  fills: number
}

export interface RatioSeries {
  give: string
  want: string
  island: string
  days: RatioDayRow[]
}

export interface GapDayRow {
  day: number
  medianA: number | null
  medianB: number | null
  gap: number | null
  band: { travelDays: number; lossProbability: number }
  insideBand: boolean | null
}

export interface GapSeries {
  give: string
  want: string
  days: GapDayRow[]
}

export interface ShareDayRow {
  day: number
  window: { from: number; to: number }
  gold: number | null
  crown: number | null
}

export interface ShareSeries {
  island: string
  organisation: string
  days: ShareDayRow[]
}

export interface MediaDayRow {
  day: number
  assets: { id: string; trades: number }[]
}

export interface MediaSeries {
  island: string
  days: MediaDayRow[]
}

export interface VolumeDayRow {
  day: number
  trades: number
}

export interface RefusalDayRow {
  day: number
  byReason: Record<string, number>
}

export interface TwoIslandsReport {
  seed: number
  ratios: RatioSeries[]
  gap: GapSeries[]
  share: ShareSeries[]
  media: MediaSeries[]
  volume: VolumeDayRow[]
  refusals: RefusalDayRow[]
  outcome: ReportOutcome
}

const person = (id: string) => id as PersonId
const assetId = (asset: Asset) => ('good' in asset ? asset.good : asset.currency)

function asAsset(state: TwoIslandsRunResult['state']['economy'], id: string): Asset {
  return Object.hasOwn(state.goods, id) ? { good: id } : { currency: id }
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function stdev(values: readonly number[]): number {
  if (values.length <= 1) return 0
  const mean = values.reduce((n, v) => n + v, 0) / values.length
  const variance = values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function assetPairs(assets: readonly string[]): { give: string; want: string }[] {
  const pairs: { give: string; want: string }[] = []
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      pairs.push({ give: assets[i], want: assets[j] })
    }
  }
  return pairs
}

function relativeGap(a: number, b: number): number {
  const mid = (a + b) / 2
  return mid > 0 ? Math.abs(a - b) / mid : Math.abs(a - b)
}

function insideBand(gap: number, travelDays: number, lossProbability: number): boolean {
  return gap <= lossProbability * travelDays
}

function ledgerFromResult(result: TwoIslandsRunResult): LedgerProvider {
  const settlement = result.state.settlement
  return {
    balance: (holder, currency = 'money') => balanceOf(settlement, holder, currency),
    rows: (holder, fromDay, toDay) => ledger(settlement, { holder, fromDay, toDay }),
    transfer: () => { throw new Error('report is read-only') },
    exchange: () => { throw new Error('report is read-only') },
  }
}

function topMedium(state: TwoIslandsRunResult['state']['economy'], market: string, fromDay: number, toDay: number): string | null {
  const rows = mediaInUse(state, market, fromDay, toDay)
  return rows.length ? assetId(rows[0].asset) : null
}

function crossIslandTrades(result: TwoIslandsRunResult, fixture: TwoIslandsFixture, fromDay: number, toDay: number) {
  return (result.state.economy.trades ?? []).filter(t => t.day >= fromDay && t.day <= toDay
    && fixture.minds[t.maker].market !== fixture.minds[t.taker].market)
}

function measureOutcome(result: TwoIslandsRunResult, fixture: TwoIslandsFixture, gap: GapSeries[]): ReportOutcome {
  const lastDay = result.days.at(-1)?.day ?? 0
  const fromDay = Math.max(0, lastDay - 9)
  const cross = crossIslandTrades(result, fixture, fromDay, lastDay)
  if (!cross.length) return 'undetermined'

  const travelDays = fixture.phases.route.travelDays
  const lossProbability = fixture.phases.route.lossProbability
  const markets = Object.values(fixture.islands).map(i => i.market)
  const topA = topMedium(result.state.economy, markets[0], fromDay, lastDay)
  const topB = topMedium(result.state.economy, markets[1], fromDay, lastDay)
  if (topA !== null && topB !== null && topA !== topB) return 'rival-conventions'

  let pairsWithGap = 0
  let pairsInside = 0
  for (const series of gap) {
    for (const row of series.days) {
      if (row.day < fromDay || row.day > lastDay || row.insideBand === null) continue
      pairsWithGap++
      if (row.insideBand) pairsInside++
    }
  }
  if (pairsWithGap > 0 && pairsInside === pairsWithGap) return 'converged'
  return 'gap-persists'
}

/** Pure report over a completed run; no rule reads this output (design v2 §8, R8). */
export function report(result: TwoIslandsRunResult, fixture: TwoIslandsFixture, options: ReportOptions = {}): TwoIslandsReport {
  const state = result.state.economy
  const config = defaultConfig()
  const seam = ledgerFromResult(result)
  const records = options.records ?? result.records
  const travelDays = fixture.phases.route.travelDays
  const lossProbability = fixture.phases.route.lossProbability
  const band = { travelDays, lossProbability }
  const markets = Object.values(fixture.islands)
  const pairs = assetPairs(fixture.ratePriors.assets)

  for (const island of markets) {
    const org = island.organisation
    for (const { day } of result.days) {
      accounts(state, config, seam, org, day, day, 'B.crown')
      accounts(state, config, seam, org, day, day, 'gold')
    }
  }

  const ratioOut: RatioSeries[] = []
  for (const island of markets) {
    for (const { give, want } of pairs) {
      const a = asAsset(state, give)
      const b = asAsset(state, want)
      const days: RatioDayRow[] = result.days.map(({ day }) => {
        const series = ratios(state, island.market, a, b, day, day)
        const values = series.map(row => row.ratio)
        return {
          day,
          spread: values.length ? Math.max(...values) - Math.min(...values) : 0,
          stdev: stdev(values),
          fills: values.length,
        }
      })
      ratioOut.push({ give, want, island: island.market, days })
    }
  }

  const gapOut: GapSeries[] = []
  const marketA = markets.find(i => i.market === fixture.phases.route.from)!
  const marketB = markets.find(i => i.market === fixture.phases.route.to)!
  for (const { give, want } of pairs) {
    const a = asAsset(state, give)
    const b = asAsset(state, want)
    const days: GapDayRow[] = result.days.map(({ day }) => {
      const ratiosA = ratios(state, marketA.market, a, b, day, day).map(r => r.ratio)
      const ratiosB = ratios(state, marketB.market, a, b, day, day).map(r => r.ratio)
      const medianA = median(ratiosA)
      const medianB = median(ratiosB)
      const gap = medianA !== null && medianB !== null ? relativeGap(medianA, medianB) : null
      const inside = gap !== null ? insideBand(gap, travelDays, lossProbability) : null
      return { day, medianA, medianB, gap, band, insideBand: inside }
    })
    gapOut.push({ give, want, days })
  }

  const shareAssets = ['gold', 'B.crown'] as const
  const shareOut: ShareSeries[] = markets.map(island => ({
    island: island.market,
    organisation: island.organisation,
    days: result.days.map(({ day }) => {
      const window = { from: Math.max(0, day - 4), to: day }
      const row: ShareDayRow = { day, window, gold: null, crown: null }
      for (const asset of shareAssets) {
        const value = acceptance(island.mindIds.map(person), asset, window, records)
        if (asset === 'gold') row.gold = value
        else row.crown = value
      }
      return row
    }),
  }))

  const mediaOut: MediaSeries[] = markets.map(island => ({
    island: island.market,
    days: result.days.map(({ day }) => ({
      day,
      assets: mediaInUse(state, island.market, day, day).map(row => ({ id: assetId(row.asset), trades: row.trades })),
    })),
  }))

  const volume = result.days.map(({ day, trades }) => ({ day, trades: trades.length }))
  const refusals = result.days.map(({ day, refusals: dayRefusals }) => {
    const byReason: Record<string, number> = {}
    for (const refusal of dayRefusals) byReason[refusal.reason] = (byReason[refusal.reason] ?? 0) + 1
    return { day, byReason }
  })

  return {
    seed: result.seed.value,
    ratios: ratioOut,
    gap: gapOut,
    share: shareOut,
    media: mediaOut,
    volume,
    refusals,
    outcome: measureOutcome(result, fixture, gapOut),
  }
}
