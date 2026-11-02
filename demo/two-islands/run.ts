import {
  Runner as EconomyRunner, currencyProvider, stock, totalUnits,
  type Asset, type Command as EconomyCommand, type EconomyEvent, type LedgerProvider, type Trade,
} from '../../src/index.ts'
import {
  Runner as SettlementRunner, initialState, balanceOf, ledger,
  type Command as SettlementCommand,
} from '../../../settlement/src/index.ts'
import {
  categorical, setBelief, perceive, observeMemory, evaluateNeeds,
  generateActions, evaluateActions, selectAction, nullPersonality, DEFAULT_COGNITIVE_PARAMS,
  type ActionDefinition, type MemoryState, type NeedState, type Stimulus, type Intention,
} from '../../../cognition/src/index.ts'
import { acceptance, type AcceptanceRecord, type PersonId } from '../../../society/src/index.ts'
import {
  createAuthorityProvider, issue, validateLaw,
  type Law, type MonetaryRequest, type MonetaryResult, type MonetaryCommand,
} from '../../../government/src/index.ts'
import { streams, simTime, type Counters } from '../../../kernel/src/index.ts'
import { assetDefinitions, seedRatePriors, type TwoIslandsFixture } from './fixture.ts'

/** The live goods ledger is deliberately an option, never command/log data (§20/§22). */
export class DemoLedger implements LedgerProvider {
  readonly settlement: SettlementRunner
  constructor(settlement: SettlementRunner) { this.settlement = settlement }
  balance(holder: string, currency = 'money') { return balanceOf(this.settlement.state, holder, currency) }
  exchange(...[legs, kind, subject, note = '', goods]: Parameters<NonNullable<LedgerProvider['exchange']>>) {
    return this.settlement.run<string[]>({ type: 'pay', legs, kind, subject, note }, goods ? { goods } : undefined)
  }
  transfer: LedgerProvider['transfer'] = (from, to, amount, kind, subject, note = '', goods) =>
    this.settlement.run<string>({ type: 'pay', from, to, amount, kind, subject, note,
      ...(goods ? { goods: { from: goods.from, to: goods.to, good: goods.good, units: goods.units } } : {}) },
    goods ? { goods: goods.ledger } : undefined)
  rows(holder: string, fromDay: number, toDay: number) { return ledger(this.settlement.state, { holder, fromDay, toDay }) }
}

type GovernmentLog = { type: 'laws'; laws: Law[] }
  | { type: 'issue'; request: MonetaryRequest; result: MonetaryResult<MonetaryCommand> }
export interface TwoIslandsLogs {
  // Before each economy command: the Settlement cursor, including independent day-zero issues/ticks.
  economy: { command: EconomyCommand; settlementBefore: number }[]
  settlement: SettlementCommand[]
  government: GovernmentLog[]
}
export interface DaySnapshot {
  day: number
  totals: Record<string, number>
  trades: Trade[]
  refusals: Extract<EconomyEvent, { type: 'refused' }>[]
  report: { acceptance: Record<string, Record<string, number | null>> }
  book: { market: string; give: string; want: string; by: string; ratio: number }[]
}

const assetId = (asset: Asset) => 'good' in asset ? asset.good : asset.currency
const person = (id: string) => id as PersonId
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const DAY = 86_400_000

function authority(laws: Law[], fixture: TwoIslandsFixture) {
  return createAuthorityProvider(laws, (read, act) => {
    if (read === 'person.place' || read === 'office.seat') {
      const currency = fixture.currencies.find(c => c.id === act.object || c.issuer === act.actor)
      if (currency) return fixture.phases.route.to // Same location as the treasury inventory.
    }
    throw new Error(`Undeclared government fact: ${read}`)
  }, office => Object.hasOwn(fixture.government.treasury, office) ? office : null)
}

function engines(fixture: TwoIslandsFixture) {
  const economy = new EconomyRunner()
  const settlement = new SettlementRunner(initialState('two-islands', 'Two islands'))
  settlement.providers.currencies = currencyProvider(() => economy.state)
  const seam = new DemoLedger(settlement)
  economy.providers.ledger = { balance: seam.balance.bind(seam), transfer: seam.transfer,
    rows: seam.rows.bind(seam), exchange: (...args) => {
      // A day's same-direction cargo shares one voyage. The single ship remains occupied through
      // its arrival tick, including a lost voyage. Capacity is physical, never a currency balance rule.
      const cargo = (args[0].goods ?? []).filter(leg => leg.to.startsWith('shipment:'))
      if (cargo.length) {
        const active = Object.values(economy.state.shipments).filter(s => s.departed < economy.state.day && s.arrives >= economy.state.day)
        // Earlier fills in this same command are already logged in Settlement, while Economy's
        // public state still precedes the command. Count those too, without double counting.
        const lastTick = settlement.log.map(c => c.type).lastIndexOf('tick')
        const loaded = settlement.log.slice(lastTick + 1).flatMap(c =>
          c.type === 'pay' && 'legs' in c ? (c.legs?.goods ?? []).filter(leg => leg.to.startsWith('shipment:')) : [])
        const from = economy.state.inventories[cargo[0].from].market
        if (active.length > 0 || loaded.some(leg => economy.state.inventories[leg.from].market !== from)
          || cargo.some(leg => economy.state.inventories[leg.from].market !== from)
          || loaded.reduce((n, leg) => n + leg.units, 0) + cargo.reduce((n, leg) => n + leg.units, 0) > fixture.ships[0].capacityUnits) {
          throw new Error('Ship unavailable or beyond capacity')
        }
      }
      return seam.exchange(...args)
    } }
  const route = fixture.phases.route
  economy.providers.transport = { days: (from, to) => from === to ? 0
    : economy.state.day >= fixture.phases.isolationDays
      && ((from === route.from && to === route.to) || (from === route.to && to === route.from))
      ? route.travelDays : Infinity }
  return { economy, settlement }
}

function totals(economy: EconomyRunner, settlement: SettlementRunner) {
  const result: Record<string, number> = {}
  for (const good of Object.keys(economy.state.goods)) result[good] = totalUnits(economy.state, good)
  for (const currency of Object.keys(economy.state.currencies ?? {})) {
    result[currency] = Object.values(settlement.state.accounts).reduce((n, account) =>
      n + (currency === 'money' ? account.balance : account.balances?.[currency] ?? 0), 0)
  }
  return result
}

function action(id: string, target?: string, exchange?: ActionDefinition['exchange']): ActionDefinition {
  return { id, target, exchange, targetKind: target ? 'exchange' : 'none', domain: 'strategy',
    duration: 1, cost: 0, capacityRequired: 0, preconditions: [],
    outcomeSpace: exchange
      ? [{ id: 'filled', deficits: {}, goalProgress: {}, success: true },
        { id: 'unfilled', deficits: {}, goalProgress: {}, success: false }]
      : [{ id: 'waited', deficits: {}, goalProgress: {}, success: false }],
    // A subjective, uninformative fill model. No market statistic or objective rate enters it.
    naiveModel: () => exchange ? categorical(['filled', 'unfilled'], [0.5, 0.5]) : categorical(['waited'], [1]) }
}

/** Test fiction scaffolding: unit unmet-need signals; perfect detection and exact numeric reports.
 * These are sensory/body inputs, not an economic price, reservation value, or predicted outcome.
 * Offers last through the next day; each candidate offers one available unit (fractions allowed).
 */
export function runTwoIslands(fixture: TwoIslandsFixture, opts: { seed?: number; days?: number } = {}) {
  const seed = opts.seed ?? fixture.seed
  const count = opts.days ?? fixture.phases.isolationDays + fixture.phases.contactDays
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid seed or days')
  const random = streams(seed)
  const ratePriors = seedRatePriors(fixture, seed)
  const { economy, settlement } = engines(fixture)
  const logs: TwoIslandsLogs = { economy: [], settlement: settlement.log, government: [] }
  const run = (command: EconomyCommand) => {
    logs.economy.push({ command: structuredClone(command), settlementBefore: settlement.log.length })
    return economy.run(command)
  }
  const mindIds = Object.keys(fixture.minds).sort()
  const markets = Object.values(fixture.islands).map(i => i.market)
  for (const good of fixture.goods) run({ type: 'defineGood', good: { id: good.id, type: good.type,
    weight: good.kgPerUnit, spoilagePerDay: good.spoilagePerDay, legal: good.legal } })
  for (const currency of fixture.currencies) run({ type: 'defineCurrency', currency })
  for (const market of markets) {
    run({ type: 'openMarket', id: market, mode: 'abstract' })
    const island = Object.values(fixture.islands).find(i => i.market === market)!
    run({ type: 'openOrganisation', name: island.organisation })
    for (const [good, basePrice] of Object.entries(island.stallBasePrice)) run({ type: 'setMarketGood', market, good, basePrice })
  }
  const inventories: Record<string, Record<string, string>> = {}
  for (const id of mindIds) {
    inventories[id] = {}
    for (const market of markets) inventories[id][market] = run({ type: 'openInventory', holder: id, market }).minted!
    for (const good of fixture.goods) {
      const units = fixture.minds[id].endowment[good.id] ?? 0
      if (units > 0) run({ type: 'addStock', inventory: inventories[id][fixture.minds[id].market], good: good.id, units })
    }
  }
  for (const [holder, endowment] of Object.entries(fixture.government.treasury)) {
    const inventory = run({ type: 'openInventory', holder, market: fixture.phases.route.to }).minted!
    run({ type: 'addStock', inventory, good: 'gold', units: endowment.gold })
  }
  const lost = run({ type: 'openInventory', holder: 'lost.sea', market: fixture.phases.route.to }).minted!
  const laws = structuredClone(fixture.government.laws) as Law[]
  for (const law of laws) {
    const failures = validateLaw(law)
    if (failures.length) throw new Error(failures.join('; '))
  }
  logs.government.push({ type: 'laws', laws })
  const may = authority(laws, fixture)
  for (const currency of fixture.currencies) {
    const amount = mindIds.reduce((n, id) => n + (fixture.minds[id].endowment[currency.id] ?? 0), 0)
    if (!amount) continue
    const request: MonetaryRequest = { law: laws.find(l => l.regulated.power === 'issue')?.id ?? null,
      office: currency.issuer, holder: currency.issuer, currency: currency.id, amount, day: 0, note: fixture.label }
    const result = issue(request, may)
    logs.government.push({ type: 'issue', request, result })
    for (const command of result.commands) settlement.run(command)
    if (result.commands.length) for (const id of mindIds) {
      const amount = fixture.minds[id].endowment[currency.id] ?? 0
      if (amount > 0) settlement.run({ type: 'pay', from: currency.issuer, to: id, amount,
        currency: currency.id, kind: 'endowment', note: fixture.label })
    }
  }
  const definitions = assetDefinitions(fixture)
  const minds: Record<string, { memory: MemoryState; needs: NeedState }> = {}
  for (const id of mindIds) {
    let beliefs = structuredClone(fixture.minds[id].beliefs)
    for (const row of ratePriors.filter(row => row.mind === id)) beliefs = setBelief(beliefs, row.give,
      `rate:${row.want}`, { kind: 'gaussian', mean: row.mean, variance: row.variance })
    const needs = evaluateNeeds(fixture.minds[id].needs, { signals: { hunger: 1, shelter: 1, preserve: 1 },
      beliefs, accumulators: {}, elapsedSeconds: 0, outcomeTags: [], cues: [] })
    minds[id] = { memory: { beliefs, episodes: [], reliability: structuredClone(fixture.minds[id].reliability) }, needs: { needs, goals: [] } }
  }
  let counters: Counters = {}
  const days: DaySnapshot[] = []
  const records: AcceptanceRecord[] = []
  const initialTotals = totals(economy, settlement)
  type Notice = { market: string; parties: string[]; stimulus: Stimulus }
  let pending: Notice[] = []
  const cue = (about: string, attribute: string, value: string | number): Stimulus => ({
    cue: `${about}:${attribute}`, about, attribute, channel: 'report', domain: 'strategy',
    present: true, detectability: 100, relevance: {},
    ...(typeof value === 'number' ? { kind: 'real', value } : { kind: 'categorical', value, values: ['yes', 'no'] }) })
  const asAsset = (id: string): Asset => Object.hasOwn(economy.state.goods, id) ? { good: id } : { currency: id }
  for (let day = 0; day < count; day++) {
    const start = economy.events.length
    const tradeStart = economy.state.trades?.length ?? 0
    const t = simTime(day * DAY)
    const decisions: { id: string; intention: Intention; command?: EconomyCommand }[] = []
    // Perceive/decide for everyone before anyone acts. Only reachable public offers and private outcomes enter.
    for (const id of mindIds) {
      const mind = minds[id], home = fixture.minds[id].market
      const reachable = day < fixture.phases.isolationDays ? [home] : markets
      const visible = reachable.flatMap(market => (economy.state.markets[market].offers ?? [])
        .filter(offer => offer.by !== id && (offer.expires === null || offer.expires >= day)).map(offer => ({ market, offer })))
      const stimuli = pending.filter(n => n.parties.includes(id) || (n.parties.length === 0 && reachable.includes(n.market))).map(n => n.stimulus)
      for (const { market, offer } of visible) stimuli.push(cue(assetId(offer.want.asset), `accepted@${market}`, 'yes'))
      // One focused observation per witnessed fact; no noise is invented for the numeric trade report.
      const observations = stimuli.flatMap(stimulus => perceive([stimulus], [1],
        { k: 0, weberFractions: { sight: 0, sound: 0, touch: 0, report: 0 } }, t,
        random.get('cognition.perception.detect', id))).map(observation =>
        // A fill reports its exact got/gave. It is one sample of an uncertain market rate,
        // not proof of a timeless constant: unit report uncertainty (test fiction) keeps
        // ordinary Gaussian updating responsive to subsequent witnessed fills.
        observation.kind === 'real' ? { ...observation, model: { ...observation.model, sigma: 1 } } : observation)
      const observed = observeMemory(observations, mind.memory, mind.needs, nullPersonality, DEFAULT_COGNITIVE_PARAMS, t)
      mind.memory = { beliefs: observed.beliefs, episodes: observed.episodes, reliability: observed.reliability }
      const assets = definitions.map(asset => ({ ...asset, accepted: { about: asset.id, attribute: `accepted@${home}` } }))
      const repertoire: ActionDefinition[] = []
      const commands = new Map<string, (intention: Intention) => EconomyCommand>()
      const dispatch = (source: string, market: string, asset: Asset) =>
        'good' in asset && economy.state.inventories[source].market !== market
          ? { fromInventory: source, deliver: { route: { from: economy.state.inventories[source].market, to: market } } }
          : { fromInventory: source }
      for (const market of reachable) for (const give of assets) {
        // Goods held abroad remain spendable there. Money is a holder balance; no debt refusal is introduced.
        const local = inventories[id][market], original = inventories[id][home]
        const source = stock(economy.state, local, give.id) > 0 ? local : original
        const available = Object.hasOwn(economy.state.goods, give.id)
          ? stock(economy.state, source, give.id) : settlement.providers.currencies!.isCurrency(give.id) ? balanceOf(settlement.state, id, give.id) : 0
        if (available <= 0) continue
        const units = Math.min(1, available)
        for (const want of assets) {
          if (give.id === want.id) continue
          const target = JSON.stringify([market, give.id, want.id])
          repertoire.push(action('offer', target, { give: { asset: give.id, units }, want: { asset: want.id } }))
          commands.set(`offer:${target}`, intention => ({ type: 'offer', by: id, market, inventory: local,
            ...dispatch(source, market, asAsset(give.id)), give: { asset: asAsset(give.id), units },
            want: { asset: asAsset(want.id), units: intention.terms!.ratioMin * intention.terms!.giveUnits },
            expires: day + 1, cause: intention.id }))
        }
      }
      for (const { market, offer } of visible) {
        const give = assetId(offer.want.asset), want = assetId(offer.give.asset)
        const units = offer.remaining
        const pay = units * offer.want.units / offer.give.units
        const local = inventories[id][market], original = inventories[id][home]
        const source = stock(economy.state, local, give) >= pay ? local : original
        repertoire.push(action('accept', offer.id, { give: { asset: give, units: pay }, want: { asset: want, units } }))
        commands.set(`accept:${offer.id}`, intention => ({ type: 'accept', by: id, offer: offer.id, inventory: local,
          ...dispatch(source, market, offer.want.asset), units, cause: intention.id }))
      }
      const view = { beliefs: mind.memory.beliefs, needs: mind.needs, params: DEFAULT_COGNITIVE_PARAMS }
      const generated = generateActions({ repertoire, wait: action('wait'), assets, body: { capacity_functional: 1 } }, view, nullPersonality)
      const evaluated = evaluateActions(generated, view, mind.memory.episodes, {}, t, nullPersonality)
      const selected = selectAction(evaluated, { mind: id, counters }, random.get('cognition.decision.select', id))
      counters = selected.counters
      const command = commands.get(`${selected.intention.action}:${selected.intention.target}`)?.(selected.intention)
      // Economy requires strictly positive legs; a zero reservation means no executable offer, not a new price.
      decisions.push({ id, intention: selected.intention,
        command: command?.type === 'offer' && command.want.units <= 0 ? undefined : command })
    }
    pending = []
    const owner = new Map(Object.values(economy.state.markets).flatMap(m => (m.offers ?? []).map(o => [o.id, { by: o.by, market: m.id, asset: assetId(o.give.asset) }] as const)))
    for (const { command } of decisions) {
      if (!command) continue
      const result = run(command)
      if (command.type === 'offer' && result.minted) owner.set(result.minted, { by: command.by, market: command.market, asset: assetId(command.give.asset) })
      for (const event of result.events) {
        if (event.type === 'refused' && (command.type === 'offer' || command.type === 'accept')) {
          const market = command.type === 'offer' ? command.market : owner.get(command.offer)?.market ?? fixture.minds[command.by].market
          const asset = command.type === 'offer' ? assetId(command.give.asset) : owner.get(command.offer)?.asset ?? ''
          pending.push({ market, parties: [command.by], stimulus: cue(command.by, `refused:${event.reason}`, 'yes') })
          if (event.reason === 'not-accepted' && event.refusedBy) {
            records.push({ day, refusedBy: person(event.refusedBy), asset, reason: 'not-accepted' })
            pending.push({ market, parties: [command.by], stimulus: cue(asset, `accepted@${market}`, 'no') })
          }
        }
      }
    }
    const departed = Object.values(economy.state.shipments).filter(s => s.departed === day && s.status === 'transit')
    if (departed.length && random.get('route')() < fixture.phases.route.lossProbability) {
      for (const shipment of departed) run({ type: 'loseShipment', shipment: shipment.id, to: lost })
    }
    run({ type: 'tick' })
    settlement.tick()
    const trades = structuredClone((economy.state.trades ?? []).slice(tradeStart))
    for (const trade of trades) {
      records.push({ day, legs: [{ to: person(trade.taker), asset: assetId(trade.gave.asset) },
        { to: person(trade.maker), asset: assetId(trade.got.asset) }] })
      // Every party OR public witness gets exactly one rate observation per fill, in maker orientation.
      const witnesses = mindIds.filter(id => id === trade.maker || id === trade.taker
        || (day < fixture.phases.isolationDays ? fixture.minds[id].market === trade.market : true))
      pending.push({ market: trade.market, parties: witnesses,
        stimulus: cue(assetId(trade.gave.asset), `rate:${assetId(trade.got.asset)}`, trade.got.units / trade.gave.units) })
      for (const asset of [trade.gave.asset, trade.got.asset]) pending.push({ market: trade.market,
        parties: witnesses, stimulus: cue(assetId(asset), `accepted@${trade.market}`, 'yes') })
    }
    for (const event of economy.events.slice(start)) if (event.type === 'offerWithdrawn') {
      const offer = owner.get(event.offer)
      if (offer) pending.push({ market: offer.market, parties: [offer.by], stimulus: cue(offer.by, `withdrawn:${event.reason}`, 'yes') })
    }
    const snapshot: DaySnapshot = { day, totals: totals(economy, settlement), trades,
      refusals: economy.events.slice(start).filter((e): e is Extract<EconomyEvent, { type: 'refused' }> => e.type === 'refused'),
      report: { acceptance: {} }, book: [] }
    for (const island of Object.values(fixture.islands)) {
      snapshot.report.acceptance[island.organisation] = {}
      for (const asset of definitions) snapshot.report.acceptance[island.organisation][asset.id] =
        acceptance(island.mindIds.map(person), asset.id, { from: 0, to: day }, records)
    }
    snapshot.book = []
    for (const market of markets) {
      for (const offer of economy.state.markets[market].offers ?? []) {
        snapshot.book.push({ market, give: assetId(offer.give.asset), want: assetId(offer.want.asset), by: offer.by,
          ratio: offer.want.units / offer.give.units })
      }
    }
    days.push(snapshot)
  }
  return { seed: { value: seed, ratePriors, minds: structuredClone(fixture.minds), personality: null,
    scaffolding: { needSignals: { hunger: 1, shelter: 1, preserve: 1 }, offerUnits: 1, offerLifetimeDays: 1,
      rateReportSigma: 1, fillPrior: 0.5 } },
    initialTotals, days, logs, records,
    minds: Object.fromEntries(mindIds.map(id => [id, minds[id].memory.beliefs])),
    state: { economy: economy.state, settlement: settlement.state, government: structuredClone(logs.government) } }
}

/** Joint replay reads commands and their Settlement boundaries, never decisions or random streams. */
export function replayTwoIslands(fixture: TwoIslandsFixture, logs: TwoIslandsLogs) {
  const { economy, settlement } = engines(fixture)
  const government: GovernmentLog[] = []
  let laws: Law[] = []
  for (const row of logs.government) {
    if (row.type === 'laws') { laws = structuredClone(row.laws); government.push({ type: 'laws', laws }) }
    else {
      const result = issue(row.request, authority(laws, fixture))
      if (!same(result, row.result)) throw new Error('Government replay differs')
      government.push({ type: 'issue', request: structuredClone(row.request), result })
    }
  }
  for (const entry of logs.economy) {
    while (settlement.log.length < entry.settlementBefore) settlement.run(structuredClone(logs.settlement[settlement.log.length]))
    if (settlement.log.length !== entry.settlementBefore) throw new Error('Settlement replay boundary differs')
    economy.run(structuredClone(entry.command))
    for (let i = entry.settlementBefore; i < settlement.log.length; i++) {
      if (!same(settlement.log[i], logs.settlement[i])) throw new Error('Joint replay payment differs')
    }
  }
  while (settlement.log.length < logs.settlement.length) settlement.run(structuredClone(logs.settlement[settlement.log.length]))
  return { economy: economy.state, settlement: settlement.state, government }
}
