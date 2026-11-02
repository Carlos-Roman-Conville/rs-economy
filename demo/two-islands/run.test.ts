import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadFixture, seedRatePriors } from './fixture.ts'
import { DemoLedger, replayTwoIslands, runTwoIslands } from './run.ts'
import { Runner as SettlementRunner } from '../../../settlement/src/index.ts'

describe('TIH1 two-islands autonomous host', () => {
  const fixture = loadFixture()
  let result: ReturnType<typeof runTwoIslands>
  let repeat: ReturnType<typeof runTwoIslands>
  let exchangeCalls: { args: Parameters<DemoLedger['exchange']>; successful: boolean }[]
  const deltas: { actual: number; expected: number }[] = []
  beforeAll(() => {
    const original = DemoLedger.prototype.exchange
    const exchange = vi.spyOn(DemoLedger.prototype, 'exchange').mockImplementation(function (this: DemoLedger, ...args) {
      const [legs, , , , goods] = args
      const inventory = () => (goods?.snapshot() as { inventories: Record<string, { stock: Record<string, number> }> } | undefined)?.inventories
      const beforeGoods = inventory()
      const changes = new Map<string, { before: number; expected: number; read: () => number }>()
      const add = (key: string, delta: number, read: () => number) => {
        const entry = changes.get(key) ?? { before: read(), expected: 0, read }
        entry.expected += delta
        changes.set(key, entry)
      }
      for (const leg of legs.money) for (const [holder, sign] of [[leg.from, -1], [leg.to, 1]] as const) {
        add(JSON.stringify([holder, leg.currency]), sign * leg.amount, () => this.balance(holder, leg.currency))
      }
      for (const leg of legs.goods ?? []) for (const [account, sign] of [[leg.from, -1], [leg.to, 1]] as const) {
        if (beforeGoods?.[account]) add(JSON.stringify([account, leg.good]), sign * leg.units,
          () => inventory()![account].stock[leg.good] ?? 0)
      }
      let successful = false
      try { const rows = original.apply(this, args); successful = true; return rows }
      finally {
        for (const change of changes.values()) deltas.push({ actual: change.read() - change.before,
          expected: successful ? change.expected : 0 })
      }
    })
    result = runTwoIslands(fixture, { days: 25 })
    exchangeCalls = exchange.mock.calls.map((args, index) => ({ args, successful: exchange.mock.results[index].type === 'return' }))
    exchange.mockRestore()
    repeat = runTwoIslands(fixture, { days: 25 })
  }, 180_000)

  it('same seed gives byte-identical JSON including drawn priors and final beliefs', () => {
    const stripBook = (value: ReturnType<typeof runTwoIslands>) => ({
      ...value,
      days: value.days.map(({ book: _book, ...day }) => day),
    })
    expect(JSON.stringify(stripBook(result))).toBe(JSON.stringify(stripBook(repeat)))
    expect(result.seed.ratePriors).toEqual(seedRatePriors(fixture, fixture.seed))
  })

  it('different seed changes the command log', () => {
    const other = runTwoIslands(fixture, { seed: fixture.seed + 1, days: 25 })
    expect(JSON.stringify(other.logs)).not.toBe(JSON.stringify(result.logs))
  }, 180_000)

  it('E3 joint replay from JSON logs gives the exact three final states', () => {
    expect(replayTwoIslands(fixture, JSON.parse(JSON.stringify(result.logs)))).toEqual(result.state)
    // Joint replay reconstructs goods; Settlement-only replay reconstructs every currency without them.
    const settlement = SettlementRunner.replay(result.logs.settlement, undefined,
      { ...new SettlementRunner(result.state.settlement).providers,
        currencies: { isCurrency: id => fixture.currencies.some(c => c.id === id) } })
    expect(settlement.state.accounts).toEqual(result.state.settlement.accounts)
    expect(settlement.state.ledger).toEqual(result.state.settlement.ledger)
  }, 180_000)

  it('conserves each asset every day across all accounts, transit and lost.sea', () => {
    for (const day of result.days) for (const [asset, total] of Object.entries(result.initialTotals)) {
      expect(day.totals[asset], `${day.day}:${asset}`).toBeCloseTo(total, 9)
    }
    expect(result.initialTotals.gold).toBe(290)
    expect(result.initialTotals['B.crown']).toBe(300)
  })

  it('each successful fill calls the ledger exchange once with both legs and a live goods option', () => {
    const fills = result.days.flatMap(day => day.trades)
    expect(fills.length).toBeGreaterThan(0)
    expect(exchangeCalls.filter(call => call.successful)).toHaveLength(fills.length)
    for (const { args: [legs, kind, , , goods], successful } of exchangeCalls) {
      if (!successful) continue // A stale resting stock can roll back; it is not a fill.
      expect(kind).toBe('exchange')
      expect(legs.money.length + (legs.goods?.length ?? 0)).toBe(2)
      if (legs.goods?.length) expect(goods?.apply).toBeTypeOf('function')
    }
    expect(result.logs.settlement.filter(command => command.type === 'pay' && 'legs' in command)).toHaveLength(fills.length)
    for (const delta of deltas) expect(delta.actual).toBeCloseTo(delta.expected, 9)
    const dispatched = result.logs.settlement.flatMap(command => command.type === 'pay'
      ? (command.legs?.goods ?? []).filter(leg => leg.to.startsWith('shipment:')) : [])
    for (const leg of dispatched) {
      const shipment = result.state.economy.shipments[leg.to.slice('shipment:'.length)]
      expect(shipment).toMatchObject({ good: leg.good, units: leg.units, from: leg.from })
    }
    expect(JSON.stringify(result.logs)).not.toMatch(/"(?:apply|checkpoint|restore)":/)
  })

  it('before contact every trade and posted offer stays on its own island', () => {
    for (const day of result.days.filter(day => day.day < fixture.phases.isolationDays)) {
      for (const trade of day.trades) {
        expect(fixture.minds[trade.maker].market).toBe(trade.market)
        expect(fixture.minds[trade.taker].market).toBe(trade.market)
      }
    }
    let day = 0
    for (const { command } of result.logs.economy) {
      if (command.type === 'tick') day++
      if (day < fixture.phases.isolationDays && command.type === 'offer') expect(command.market).toBe(fixture.minds[command.by].market)
    }
    expect(Object.values(result.state.economy.shipments).every(s => s.departed >= fixture.phases.isolationDays)).toBe(true)
  })

  it('forced voyage loss transfers the cargo once to lost.sea, conserves and replays', () => {
    const forced = structuredClone(fixture)
    const lossFixture = { ...forced, phases: { ...forced.phases, route: { ...forced.phases.route, lossProbability: 1 } } }
    const lostRun = runTwoIslands(lossFixture, { days: 25 })
    const shipments = Object.values(lostRun.state.economy.shipments)
    expect(shipments.length).toBeGreaterThan(0)
    expect(shipments.every(s => s.status === 'lost')).toBe(true)
    const lost = Object.values(lostRun.state.economy.inventories).find(i => i.holder === 'lost.sea')!
    for (const good of fixture.goods) {
      expect(lost.stock[good.id] ?? 0).toBeCloseTo(shipments.filter(s => s.good === good.id).reduce((n, s) => n + s.units, 0), 9)
      for (const day of lostRun.days) expect(day.totals[good.id]).toBeCloseTo(lostRun.initialTotals[good.id], 9)
    }
    expect(lostRun.logs.economy.filter(row => row.command.type === 'loseShipment')).toHaveLength(shipments.length)
    expect(replayTwoIslands(lossFixture, lostRun.logs)).toEqual(lostRun.state)
  }, 180_000)

  it('capacity bounds each voyage and arrivals preserve the configured travel time', () => {
    const voyages = new Map<number, number>()
    for (const shipment of Object.values(result.state.economy.shipments)) {
      expect(shipment.arrives - shipment.departed).toBe(fixture.phases.route.travelDays)
      voyages.set(shipment.departed, (voyages.get(shipment.departed) ?? 0) + shipment.units)
    }
    expect(voyages.size).toBeGreaterThan(0)
    for (const units of voyages.values()) expect(units).toBeLessThanOrEqual(fixture.ships[0].capacityUnits)
  })

  it('fences Society acceptance to the report and never calls the observed-ratio view', () => {
    const source = readFileSync(new URL('./run.ts', import.meta.url), 'utf8')
    expect(source.match(/\bacceptance\s*\(/g)).toHaveLength(1)
    expect(source).toMatch(/snapshot\.report\.acceptance\[island\.organisation\]\[asset\.id\]\s*=\s*acceptance\(/)
    expect(source).not.toMatch(/\b(?:ratios|mediaInUse)\s*\(/)
    expect(source.match(/snapshot\.report/g)).toHaveLength(2)
  })

  it('seeds no acceptance or reservation values and uses null personality', () => {
    for (const mind of Object.values(result.seed.minds)) {
      expect(JSON.stringify(mind)).not.toMatch(/"(?:acceptance|reservation|reservationRatio|ratioMin)"/)
    }
    expect(result.seed.personality).toBeNull()
  })

  it('bootstraps at least one posted offer from the full fixture without asserting its outcome', () => {
    expect(result.logs.economy.some(row => row.command.type === 'offer')).toBe(true)
    for (const { command } of result.logs.economy) if (command.type === 'offer' || command.type === 'accept') {
      expect(command.cause).toMatch(/^int\./)
    }
  })

  it('witnessed fills update Cognition rate beliefs without making them dogmatic', () => {
    const priors = result.seed.ratePriors
    expect(priors.some(row => {
      const belief = result.minds[row.mind].entries.find(e => e.about === row.give && e.attribute === `rate:${row.want}`)!.belief
      return belief.kind === 'gaussian' && belief.mean !== row.mean && belief.variance > 0 && belief.variance < row.variance
    })).toBe(true)
  })

  it('issues starting crowns only under may, records its process, and does not mint gold', () => {
    const issues = result.logs.government.filter(row => row.type === 'issue')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ result: { events: [{ outcome: 'command', action: 'issue' }] } })
    const credits = result.logs.settlement.filter(command => command.type === 'credit')
    expect(credits).toMatchObject([{ amount: 300, currency: 'B.crown', process: 'government.monetary.issue' }])
    const denied = runTwoIslands({ ...fixture, government: { ...fixture.government, laws: [] } }, { days: 0 })
    expect(denied.logs.settlement.some(command => command.type === 'credit')).toBe(false)
    expect(denied.initialTotals['B.crown']).toBe(0)
    expect(denied.initialTotals.gold).toBe(result.initialTotals.gold)
  })
})
