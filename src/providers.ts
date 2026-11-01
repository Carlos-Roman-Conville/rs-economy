// What this engine asks of the host (CONTRACTS.md §3, §4b, §4c, §5). The engine imports no other engine; the host
// implements these from @rex/settlement, @rex/realism, its map and its population model, or the stubs below.

import { finite, nonempty, simTime, transfer, TransferJournal, type TransferLedger, type TransferRequest } from '@rex/kernel'

export interface MoneyLeg { from: string; to: string; currency: string; amount: number }
export interface GoodsLeg { from: string; to: string; good: string; units: number }

export interface LedgerRow {
  currency?: string; batch?: string; process?: string
  id: string; day: number; kind: string; from: string | null; to: string | null
  subject: string | null; amount: number; authority: string | null; note: string
}

/** Money has one home (§3): Settlement's accounts in the pirate game. Economy keeps no balances. */
export interface LedgerProvider {
  balance(holder: string, currency?: string): number
  /** The pirate host adds this optional seam in unit 5269. */
  exchange?(legs: { money: MoneyLeg[]; goods?: GoodsLeg[] }, kind: string, subject: string | null, note?: string, goods?: TransferLedger): string[]
  transfer(from: string, to: string, amount: number, kind: string, subject: string | null, note?: string,
    /** The goods leg of a paid exchange. `ledger` is the economy's goods TransferLedger, built by the economy inside
     *  the command that calls `transfer`; `from` and `to` are its accounts (inventory ids), `good` its quantity (a good
     *  id), `units` the amount (a finite number >= 0; fractions allowed). */
    goods?: { ledger: TransferLedger; from: string; to: string; good: string; units: number }): string
  rows(holder: string, fromDay: number, toDay: number): LedgerRow[]
}

/** Read-only view of a settlement (§4b); the host builds it from SettlementState each day. */
export interface SettlementReader {
  businesses(market: string): { id: string; inventory: string; account: string; status: string; open: boolean }[]
  posts(market: string): { id: string; biz: string; role: string; wage: number; hours: number; filledBy: string | null }[]
  production(biz: string, day: number): { recipe: string; q: number }[] | null
  hasFixture(market: string, fixture: string): boolean
}

export interface PopulationProvider {
  headcount(market: string, day: number): number
}

export interface LabourRow { category: string; persons: number; personHours: number }

export interface LabourSupply {
  /** The population's supply today by category (adult men, adult women, elders, children: Reality's
   *  categories); persons = cohort × health × (1 − sick share), health applied once; personHours = persons ×
   *  the host's hours per day (one number, Settlement's `hoursPerDay`, SET-12). */
  supply(day: number): LabourRow[]
  /** False while a person is aboard, dead or away: the host knows, the engines do not. */
  available(person: string, day: number): boolean
  /** Person-hours a person or a pool offers for a role today. */
  hours(source: string, role: string, day: number): number
  /** Person-hours a pool grants a post today: at most `wantedHours` and at most what it has not granted yet. */
  draw(pool: string, role: string, requires: unknown, wantedHours: number, day: number): number
  /** 0..n output factor of a holder in a role; the host maps skill bands to it. */
  productivity(holder: string, role: string): number
}

export interface TransportProvider {
  /** Travel days from one market to another; Infinity when unreachable. */
  days(from: string, to: string): number
}

export interface Providers {
  ledger: LedgerProvider
  population: PopulationProvider
  labour: LabourSupply
  transport: TransportProvider
}

// In-memory stubs for tests and examples.

export class StubLedger implements LedgerProvider {
  balances: Record<string, number> = {}
  log: LedgerRow[] = []
  day = 0
  byCurrency: Record<string, Record<string, number>> = {}
  currencies?: { isCurrency(id: string): boolean }
  private checkCurrency(id: string): void {
    if (id !== 'money' && !this.currencies?.isCurrency(id)) throw new Error(`unknown currency: ${id}`)
  }
  balance(holder: string, currency = 'money'): number {
    this.checkCurrency(currency)
    const balances = currency === 'money' ? this.balances : this.byCurrency[currency]
    return balances && Object.hasOwn(balances, holder) ? balances[holder] : 0
  }
  exchange(legs: { money: MoneyLeg[]; goods?: GoodsLeg[] }, kind: string, subject: string | null,
    note = '', goods?: TransferLedger): string[] {
    if (legs.goods !== undefined && !goods) throw new Error('goods legs require a goods ledger')
    if (goods && legs.goods === undefined) throw new Error('goods ledger requires goods legs')
    for (const leg of legs.money) {
      this.checkCurrency(leg.currency)
      nonempty(leg.from, 'from'); nonempty(leg.to, 'to'); finite(leg.amount, 'amount', 0)
    }
    for (const leg of legs.goods ?? []) {
      nonempty(leg.from, 'from'); nonempty(leg.to, 'to'); nonempty(leg.good, 'good'); finite(leg.units, 'units', 0)
      goods!.unit(leg.from, leg.good); goods!.unit(leg.to, leg.good)
    }
    const money: TransferLedger = {
      id: 'stub.money',
      unit: (_account, currency) => { this.checkCurrency(currency); return 'money' },
      apply: (account, currency, delta) => {
        const next = this.balance(account, currency) + delta
        if (currency !== 'money' && !Object.hasOwn(this.byCurrency, currency)) {
          Object.defineProperty(this.byCurrency, currency, { value: {}, enumerable: true, writable: true, configurable: true })
        }
        const balances = currency === 'money' ? this.balances : this.byCurrency[currency]
        Object.defineProperty(balances, account, { value: next, enumerable: true, writable: true, configurable: true })
      },
      snapshot: () => structuredClone({ balances: this.balances, byCurrency: this.byCurrency }),
      restore: snapshot => {
        const saved = snapshot as { balances: Record<string, number>; byCurrency: Record<string, Record<string, number>> }
        this.balances = saved.balances; this.byCurrency = saved.byCurrency
      },
    }
    const t = simTime(this.day * 86_400_000)
    const requests: TransferRequest[] = []
    for (const leg of legs.money) if (leg.amount > 0 && leg.from !== leg.to) requests.push({
      t, process: 'economy.trade.trade', quantity: leg.currency, unit: 'money', amount: leg.amount,
      from: { ledger: money, account: leg.from }, to: { ledger: money, account: leg.to },
    })
    for (const leg of legs.goods ?? []) if (leg.units > 0) requests.push({
      t, process: 'economy.trade.trade', quantity: leg.good, unit: goods!.unit(leg.from, leg.good), amount: leg.units,
      from: { ledger: goods!, account: leg.from }, to: { ledger: goods!, account: leg.to },
    })
    transfer(new TransferJournal('economy.stub-ledger'), ...requests)
    const batch = `txn.${String(this.log.length + 1).padStart(4, '0')}`
    return legs.money.map(({ from, to, currency, amount }) => {
      const id = `txn.${String(this.log.length + 1).padStart(4, '0')}`
      this.log.push({ id, day: this.day, kind, from, to, subject, amount, authority: null, note,
        ...(currency === 'money' ? {} : { currency }), batch })
      return id
    })
  }
  transfer(from: string, to: string, amount: number, kind: string, subject: string | null, note = '',
    goods?: { ledger: TransferLedger; from: string; to: string; good: string; units: number }): string {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`amount must be a number >= 0`)
    if (goods === undefined) {
      this.balances[from] = this.balance(from) - amount
      this.balances[to] = this.balance(to) + amount
    } else {
      const money: TransferLedger = {
        id: 'stub.money',
        unit: () => 'money',
        apply: (account, _quantity, delta) => { this.balances[account] = this.balance(account) + delta },
        snapshot: () => structuredClone(this.balances),
        restore: snapshot => { this.balances = structuredClone(snapshot as Record<string, number>) },
      }
      const t = simTime(this.day * 86_400_000)
      const requests: TransferRequest[] = []
      if (amount > 0 && from !== to) requests.push({
        t, process: 'economy.trade.trade', quantity: 'money', unit: 'money', amount,
        from: { ledger: money, account: from }, to: { ledger: money, account: to },
      })
      if (goods.units > 0) requests.push({
        t, process: 'economy.trade.trade', quantity: goods.good,
        unit: goods.ledger.unit(goods.from, goods.good), amount: goods.units,
        from: { ledger: goods.ledger, account: goods.from }, to: { ledger: goods.ledger, account: goods.to },
      })
      transfer(new TransferJournal('economy.stub-ledger'), ...requests)
    }
    const id = `txn.${String(this.log.length + 1).padStart(4, '0')}`
    this.log.push({ id, day: this.day, kind, from, to, subject, amount, authority: null, note })
    return id
  }
  rows(holder: string, fromDay: number, toDay: number): LedgerRow[] {
    return this.log.filter((row) => (row.from === holder || row.to === holder) && row.day >= fromDay && row.day <= toDay)
  }
}

export class StubPopulation implements PopulationProvider {
  counts: Record<string, number> = {}
  headcount(market: string): number { return this.counts[market] ?? 0 }
}

export class StubLabourSupply implements LabourSupply {
  rows: Record<number, LabourRow[]> = {}
  table: Record<string, number> = {}        // key `${source}:${role}`, person-hours
  away = new Set<string>()
  factors: Record<string, number> = {}      // key `${holder}:${role}`
  private grants = new Map<string, number>()
  set(source: string, role: string, hours: number): void { this.table[`${source}:${role}`] = hours }
  supply(day: number): LabourRow[] { return this.rows[day] ?? [] }
  available(person: string, _day: number): boolean { return !this.away.has(person) }
  hours(source: string, role: string, _day: number): number { return this.table[`${source}:${role}`] ?? 0 }
  draw(pool: string, role: string, _requires: unknown, wantedHours: number, day: number): number {
    const key = JSON.stringify([pool, role, day])
    const granted = this.grants.get(key) ?? 0
    const hours = Math.max(0, Math.min(wantedHours, this.hours(pool, role, day) - granted))
    this.grants.set(key, granted + hours)
    return hours
  }
  productivity(holder: string, role: string): number { return this.factors[`${holder}:${role}`] ?? 1 }
}

export class StubTransport implements TransportProvider {
  table: Record<string, number> = {}        // key `${from}>${to}`
  set(from: string, to: string, days: number): void { this.table[`${from}>${to}`] = days; this.table[`${to}>${from}`] = days }
  days(from: string, to: string): number { return from === to ? 0 : (this.table[`${from}>${to}`] ?? Number.POSITIVE_INFINITY) }
}

/** A SettlementReader over plain lists, for tests of the labour market without a settlement engine on disk. */
export class StubSettlementReader implements SettlementReader {
  bizRows: Record<string, { id: string; inventory: string; account: string; status: string; open: boolean }[]> = {}
  postRows: Record<string, { id: string; biz: string; role: string; wage: number; hours: number; filledBy: string | null }[]> = {}
  productionRows: Record<string, { day: number; lines: { recipe: string; q: number }[] }> = {}
  fixtures: Record<string, string[]> = {}
  businesses(market: string) { return this.bizRows[market] ?? [] }
  posts(market: string) { return this.postRows[market] ?? [] }
  production(biz: string, day: number) { const r = this.productionRows[biz]; return r && r.day === day ? r.lines : null }
  hasFixture(market: string, fixture: string): boolean { return (this.fixtures[market] ?? []).includes(fixture) }
}

export function stubProviders(): Providers & { ledger: StubLedger; population: StubPopulation; labour: StubLabourSupply; transport: StubTransport } {
  return { ledger: new StubLedger(), population: new StubPopulation(), labour: new StubLabourSupply(), transport: new StubTransport() }
}
