// Tunables. Every value here is marked proposed; a host overrides it from its own data. Nothing Rex has not decided
// is given a number: where he has not, the default is the rule that does nothing (price: base, wage: posted-median).

import type { WageRule } from './labour.ts'

export type PriceRule =
  | { kind: 'base' }                                     // price = basePrice; the open state until Rex chooses a curve
  | { kind: 'king-davenant-table'; cap: number }           // Davenant 1699 (ECON-DAV), the table interpolated; researched curve, estimate cap; not Rex's until econ 5 is approved
  | { kind: 'shortage-linear'; low: number; high: number } // price = base x (low + (high - low) x shortage); ALIGNMENT s10's illustration is low 0.7, high 3.0, NOT adopted

export type InputsAnyChoice = 'first-available'          // which option of an inputsAny group is consumed (proposed)

export function assertPriceRule(rule: PriceRule): void {
  if (rule.kind === 'king-davenant-table' && !(rule.cap >= 5.5)) {
    throw new Error(`king-davenant-table cap ${rule.cap} must be at least 5.5`)
  }
}

export interface EconomyConfig {
  priceRule: PriceRule
  wageRule: WageRule
  inputsAnyChoice: InputsAnyChoice
  tickOrder: readonly string[]
}

export const TICK_ORDER = ['production', 'shipments', 'spoilage', 'consumption', 'prices', 'advance'] as const

export function defaultConfig(): EconomyConfig {
  return { priceRule: { kind: 'base' }, wageRule: { kind: 'posted-median' }, inputsAnyChoice: 'first-available', tickOrder: TICK_ORDER }
}
