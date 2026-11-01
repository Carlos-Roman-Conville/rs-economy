// Events the reducer returns. The host folds them; the engine never pushes.

import type { MoneyLeg, GoodsLeg } from './providers.ts'

export type Refused = { type: 'refused'; command: 'buy' | 'sell' | 'takeMass' | 'exchange'; reason: 'price-above-limit' | 'price-below-limit' | 'no-price' | 'beyond-stock' | 'no-stock'; price: number | null; limit?: number; units?: number; available?: number; cause?: string }

export type ActionOutcome = { type: 'shared.action.outcome'; cause: string; status: 'completed' | 'failed'; stimuli: Record<string, string | number | null>[]; payload: EconomyEvent }

export type EconomyEvent = { cause?: string } & (
  | { type: 'currencyDefined'; currency: string }
  | { type: 'exchanged'; money: MoneyLeg[]; goods: GoodsLeg[] | undefined; txns: string[] }
  | Refused
  | ActionOutcome
  | { type: 'goodDefined'; good: string }
  | { type: 'recipeDefined'; recipe: string }
  | { type: 'inventoryOpened'; inventory: string; holder: string; market: string }
  | { type: 'marketOpened'; market: string; mode: string; inventory: string }
  | { type: 'marketGoodSet'; market: string; good: string }
  | { type: 'stockChanged'; inventory: string; good: string; delta: number; reason: string }
  | { type: 'produced'; inventory: string; recipe: string; units: number; output: string | null; outputUnits: number }
  | { type: 'spoiled'; inventory: string; good: string; units: number }
  | { type: 'consumed'; market: string; good: string; units: number; unmet: number }
  | { type: 'shortage'; market: string; good: string; stock: number; targetReserve: number; shortage: number }
  | { type: 'priceSet'; market: string; good: string; price: number; was: number | null }
  | { type: 'organisationOpened'; organisation: string; name: string }
  | { type: 'sold'; inventory: string; market: string; good: string; units: number; price: number; amount: number; txn: string }
  | { type: 'bought'; inventory: string; market: string; good: string; units: number; price: number; amount: number; txn: string }
  | { type: 'shipped'; shipment: string; from: string; to: string; good: string; units: number; arrives: number; freightTxn: string | null }
  | { type: 'arrived'; shipment: string; to: string; good: string; units: number }
  | { type: 'dayEnded'; day: number }
)
