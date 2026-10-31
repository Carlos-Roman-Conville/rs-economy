// Pure reads over state. Prices follow config.priceRule (CONTRACTS.md §7: a config key until Rex chooses).

import { assertPriceRule, type EconomyConfig } from './config.ts'
import type { LedgerProvider } from './providers.ts'
import type { EconomyState } from './state.ts'

export function stock(state: EconomyState, inventory: string, good: string): number {
  const inv = state.inventories[inventory]
  if (!inv) throw new Error(`unknown inventory: ${inventory}`)
  return inv.stock[good] ?? 0
}

/** Stock of a good for sale in a market (its own inventory). */
export function marketStock(state: EconomyState, market: string, good: string): number {
  const mkt = state.markets[market]
  if (!mkt) throw new Error(`unknown market: ${market}`)
  return stock(state, mkt.inventory, good)
}

/** 0 when stock meets the target reserve, 1 when empty; null when the host has not set a reserve (open). */
export function shortage(state: EconomyState, market: string, good: string): number | null {
  const entry = state.markets[market]?.goods[good]
  if (!entry || entry.targetReserve === null) return null
  if (entry.targetReserve <= 0) return 0
  return Math.max(0, Math.min(1, 1 - marketStock(state, market, good) / entry.targetReserve))
}

/** The price of a good in a market by the configured rule, computed now; null when the host has set no base price (open).
 *  The tick writes the same number to `MarketGood.price` once a day (step `prices`). */
export function price(state: EconomyState, config: EconomyConfig, market: string, good: string): number | null {
  const rule = config.priceRule
  assertPriceRule(rule)
  const entry = state.markets[market]?.goods[good]
  if (!entry || entry.basePrice === null) return null
  if (rule.kind === 'base') return entry.basePrice
  const s = shortage(state, market, good) ?? 0
  if (rule.kind === 'king-davenant-table') {
    if (s >= 0.5) return entry.basePrice * rule.cap
    const multiples = [1, 1.3, 1.8, 2.6, 3.8, 5.5]
    const interval = Math.floor(s * 10)
    const fraction = s * 10 - interval
    return entry.basePrice * (multiples[interval] + (multiples[interval + 1] - multiples[interval]) * fraction)
  }
  return entry.basePrice * (rule.low + (rule.high - rule.low) * s)
}

/** An inventory's value at its market's prices; goods with no price count 0 and are listed as unpriced. */
export function inventoryValue(state: EconomyState, config: EconomyConfig, inventory: string): { value: number; unpriced: string[] } {
  const inv = state.inventories[inventory]
  if (!inv) throw new Error(`unknown inventory: ${inventory}`)
  let value = 0
  const unpriced: string[] = []
  for (const [good, units] of Object.entries(inv.stock)) {
    const p = price(state, config, inv.market, good)
    if (p === null) unpriced.push(good)
    else value += p * units
  }
  return { value, unpriced }
}

/** Yesterday's observed production of a good into a market (through `produce`). */
export function producedLast(state: EconomyState, market: string, good: string): number {
  return state.markets[market]?.goods[good]?.producedLast ?? 0
}

/** Units of a good still on the way, summed over shipments in transit. */
export function inTransit(state: EconomyState, good: string): number {
  return Object.values(state.shipments).filter((s) => s.status === 'transit' && s.good === good).reduce((sum, s) => sum + s.units, 0)
}

/** Every unit of a good anywhere: inventories plus transit. Conserved by moves, sales and shipping (E10, E11). */
export function totalUnits(state: EconomyState, good: string): number {
  const held = Object.values(state.inventories).reduce((sum, inv) => sum + (inv.stock[good] ?? 0), 0)
  return held + inTransit(state, good)
}

export interface Accounts {
  holder: string
  fromDay: number
  toDay: number
  revenue: number          // rows paid to the holder with kind `sale`
  purchases: number        // rows paid by the holder with kind `purchase`
  wages: number            // rows paid by the holder with kind `wage` (Settlement's)
  rent: number             // `rent`, paid by the holder
  freight: number          // `freight`, paid by the holder
  otherIn: number          // every other row to the holder
  otherOut: number         // every other row from the holder
  profit: number           // (revenue + otherIn) - (purchases + wages + rent + freight + otherOut)
  inventoryValue: number   // the holder's inventories at today's market prices
  unpriced: string[]       // goods held with no price
}

/** The accounting view (CONTRACTS.md §8): a pure read over the ledger provider's rows and the holder's inventories.
 *  Never state: the ledger stays the record. A row the holder both pays and receives counts on neither side. */
export function accounts(state: EconomyState, config: EconomyConfig, ledger: LedgerProvider, holder: string, fromDay: number, toDay: number): Accounts {
  const out: Accounts = { holder, fromDay, toDay, revenue: 0, purchases: 0, wages: 0, rent: 0, freight: 0, otherIn: 0, otherOut: 0, profit: 0, inventoryValue: 0, unpriced: [] }
  for (const row of ledger.rows(holder, fromDay, toDay)) {
    if (row.from === holder && row.to === holder) continue
    if (row.to === holder) { if (row.kind === 'sale') out.revenue += row.amount; else out.otherIn += row.amount }
    else if (row.from === holder) {
      if (row.kind === 'purchase') out.purchases += row.amount
      else if (row.kind === 'wage') out.wages += row.amount
      else if (row.kind === 'rent') out.rent += row.amount
      else if (row.kind === 'freight') out.freight += row.amount
      else out.otherOut += row.amount
    }
  }
  out.profit = out.revenue + out.otherIn - (out.purchases + out.wages + out.rent + out.freight + out.otherOut)
  for (const inv of Object.values(state.inventories)) {
    if (inv.holder !== holder) continue
    const v = inventoryValue(state, config, inv.id)
    out.inventoryValue += v.value
    for (const g of v.unpriced) if (!out.unpriced.includes(g)) out.unpriced.push(g)
  }
  return out
}
