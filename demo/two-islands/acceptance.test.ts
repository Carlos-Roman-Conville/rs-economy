import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Runner as EconomyRunner, currencyProvider } from '../../src/index.ts'
import { Runner as SettlementRunner } from '../../../settlement/src/index.ts'
import { acceptance } from '../../../society/src/index.ts'
import type { PersonId } from '../../../society/src/index.ts'
import { legalTender, validateLaw } from '../../../government/src/index.ts'
import type { Law } from '../../../government/src/index.ts'
import { loadFixture } from './fixture.ts'
import { DemoLedger, runTwoIslands } from './run.ts'
import { report } from './report.ts'

const fixture = loadFixture()
const days = 25
const person = (id: string) => id as PersonId

function settlementIssueNet(ledger: { day: number; kind: string; currency?: string; amount: number }[], currency: string, throughDay: number): number {
  return ledger.reduce((n, row) => {
    if (row.day > throughDay) return n
    if ((row.currency ?? 'money') !== currency) return n
    if (row.kind === 'credit') return n + row.amount
    if (row.kind === 'debit') return n - row.amount
    return n
  }, 0)
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...listFiles(path))
    else out.push(path)
  }
  return out
}

function legalTenderLaw(): Law {
  const law: Law = {
    id: 'government/law.b-crown-tender',
    issuer: 'B',
    enactment: 'event.enactment.b-crown-tender',
    jurisdiction: { authority: 'B', places: ['B'], persons: 'all', from: null, until: null },
    modality: 'require',
    regulated: { action: 'accept-payment', object: 'any' },
    tender: { assets: ['B.crown'], purposes: ['tax', 'debt'] },
    condition: { read: 'actor.office', op: 'eq', value: 'B.treasury' },
    exceptions: [],
    consequence: { kind: 'void' },
    enforcer: [],
    procedure: null,
    status: 'in-force',
    supersedes: [],
    sources: [{ key: 'b-crown-tender', title: 'B crown legal tender (test fiction)', year: null, locator: null }],
  }
  const failures = validateLaw(law)
  if (failures.length) throw new Error(failures.join('; '))
  return law
}

describe('TIH2 two-islands acceptance (design v2 §8)', () => {
  let result: ReturnType<typeof runTwoIslands>

  it('Economy: one transfer per fill', () => {
    result = runTwoIslands(fixture, { days })
    const fills = result.days.flatMap(day => day.trades)
    const exchanges = result.logs.settlement.filter(command => command.type === 'pay' && 'legs' in command)
    expect(exchanges.length).toBe(fills.length)
  }, 180_000)

  it('Economy: conservation per asset per day', () => {
    if (!result) result = runTwoIslands(fixture, { days })
    for (const day of result.days) {
      for (const [asset, total] of Object.entries(result.initialTotals)) {
        expect(day.totals[asset], `${day.day}:${asset}`).toBeCloseTo(total, 9)
      }
    }
  })

  it('Economy: fence — only report.ts may call ratios() or mediaInUse() under demo/two-islands', () => {
    const demoRoot = fileURLToPath(new URL('.', import.meta.url))
    const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
    const srcRoot = join(repoRoot, 'src')
    const allowedSrc = new Set([join(srcRoot, 'queries.ts'), join(srcRoot, 'index.ts')])
    for (const file of listFiles(srcRoot)) {
      if (!file.endsWith('.ts') || allowedSrc.has(file)) continue
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\b(?:ratios|mediaInUse)\s*\(/)
    }
    for (const file of listFiles(demoRoot)) {
      if (!file.endsWith('.ts') || file.endsWith('report.ts') || file.endsWith('.test.ts')) continue
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\b(?:ratios|mediaInUse)\s*\(/)
    }
  })

  it('Economy: caused buy in unquoted B.crown yields one failed not-accepted outcome', () => {
    const fx = structuredClone(loadFixture())
    ;(fx.islands.A.stallBasePrice as Record<string, number | null>).fish = 3
    const run = runTwoIslands(fx, { days: 0 })
    const economy = new EconomyRunner(run.state.economy)
    const settlement = new SettlementRunner(run.state.settlement)
    settlement.providers.currencies = currencyProvider(() => economy.state)
    const seam = new DemoLedger(settlement)
    economy.providers.ledger = {
      balance: seam.balance.bind(seam),
      transfer: seam.transfer.bind(seam),
      rows: seam.rows.bind(seam),
      exchange: seam.exchange.bind(seam),
    }
    const mind = 'A.mind.01'
    const inventory = Object.values(economy.state.inventories).find(i => i.holder === mind && i.market === 'A')!.id
    settlement.run({ type: 'credit', holder: mind, currency: 'B.crown', amount: 50, process: 'test.issue' })
    const before = JSON.stringify([economy.state, settlement.state])
    const events = economy.run({
      type: 'buy', inventory, good: 'fish', units: 1, currency: 'B.crown', cause: 'intent.test',
    }).events
    expect(JSON.stringify([economy.state, settlement.state])).toBe(before)
    const outcomes = events.filter(e => e.type === 'shared.action.outcome')
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({ status: 'failed', stimuli: [{ reason: 'not-accepted' }] })
  }, 120_000)

  it('Economy: crossing fills trade at the resting offer ratio', () => {
    const resting = new Map<string, number>()
    const original = EconomyRunner.prototype.run
    const run = vi.spyOn(EconomyRunner.prototype, 'run').mockImplementation(function (this: EconomyRunner, command, ...args) {
      const outcome = original.apply(this, [command, ...args] as Parameters<typeof original>)
      if (command.type === 'offer' && outcome.minted) {
        resting.set(outcome.minted, command.want.units / command.give.units)
      }
      return outcome
    })
    const traced = runTwoIslands(fixture, { days })
    run.mockRestore()
    for (const trade of traced.state.economy.trades ?? []) {
      const ratio = resting.get(trade.offer)
      expect(ratio, trade.offer).toBeDefined()
      expect(trade.got.units / trade.gave.units).toBeCloseTo(ratio!, 9)
    }
  }, 180_000)

  it('Settlement T1: each currency total equals start plus logged issues minus retires every day', () => {
    if (!result) result = runTwoIslands(fixture, { days })
    const currencies = ['B.crown'] as const
    for (const day of result.days) {
      for (const currency of currencies) {
        const net = settlementIssueNet(result.state.settlement.ledger, currency, day.day)
        expect(day.totals[currency]).toBeCloseTo(net, 9)
      }
    }
  })

  it('Settlement T2: Settlement log replay moves money legs exactly and no goods leg', () => {
    if (!result) result = runTwoIslands(fixture, { days })
    const replay = SettlementRunner.replay(result.logs.settlement, undefined,
      { ...new SettlementRunner(result.state.settlement).providers,
        currencies: { isCurrency: id => fixture.currencies.some(c => c.id === id) } })
    expect(replay.state.accounts).toEqual(result.state.settlement.accounts)
    expect(replay.state.ledger).toEqual(result.state.settlement.ledger)
  })

  it('Cognition (a): changing Society share in report input leaves run decisions byte-identical', () => {
    const a = runTwoIslands(fixture, { days })
    const b = runTwoIslands(fixture, { days })
    expect(JSON.stringify(a.logs)).toBe(JSON.stringify(b.logs))
    const base = report(a, fixture)
    const tampered = report(a, fixture, { records: [...a.records, { day: 0, refusedBy: person('A.mind.01'), asset: 'gold', reason: 'not-accepted' }] })
    expect(base.share).not.toEqual(tampered.share)
  }, 180_000)

  it('Society: share replays from records and changing records changes no balance or transfer', () => {
    if (!result) result = runTwoIslands(fixture, { days })
    const day = result.days.at(-1)!
    for (const island of Object.values(fixture.islands)) {
      for (const asset of ['gold', 'B.crown'] as const) {
        const fromReport = day.report.acceptance[island.organisation][asset]
        const replayed = acceptance(island.mindIds.map(person), asset, { from: 0, to: day.day }, result.records)
        expect(replayed).toBe(fromReport)
      }
    }
    const before = structuredClone(result.state)
    acceptance(fixture.islands.A.mindIds.map(person), 'gold', { from: 0, to: day.day },
      [...result.records, { day: 0, refusedBy: person('B.mind.01'), asset: 'gold', reason: 'not-accepted' }])
    expect(result.state).toEqual(before)
  })

  it('Government (a): legal tender for B.crown leaves Economy quotes unchanged', () => {
    const base = runTwoIslands(fixture, { days })
    const withTender = runTwoIslands({
      ...fixture,
      government: { ...fixture.government, laws: [...fixture.government.laws, legalTenderLaw()] },
    }, { days })
    expect(withTender.state.economy.markets).toEqual(base.state.economy.markets)
    expect(withTender.state.economy.goods).toEqual(base.state.economy.goods)
  }, 180_000)

  it('Government (e): without government laws legalTender is empty every day', () => {
    const scope = { authority: 'B', actor: 'A.mind.01', place: 'B', facts: () => undefined }
    expect(legalTender([], scope, 0, 'tax')).toEqual([])
    expect(legalTender([], scope, days, 'debt')).toEqual([])
  })

  it('Demonstration: report is deterministic for a seed', () => {
    const run = runTwoIslands(fixture, { days })
    expect(report(run, fixture)).toEqual(report(run, fixture))
    const other = runTwoIslands(fixture, { seed: fixture.seed + 1, days })
    expect(report(other, fixture).seed).toBe(fixture.seed + 1)
  }, 180_000)

  it('Demonstration: outcome is one of the four measured values, not a fixed target', () => {
    if (!result) result = runTwoIslands(fixture, { days })
    const { outcome } = report(result, fixture)
    expect(['converged', 'gap-persists', 'rival-conventions', 'undetermined']).toContain(outcome)
  })
})

describe('TIH2 report fence', () => {
  it('run.ts never calls ratios() or mediaInUse()', () => {
    const source = readFileSync(fileURLToPath(new URL('./run.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/\b(?:ratios|mediaInUse)\s*\(/)
  })
})
